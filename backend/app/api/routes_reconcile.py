from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import select

from app.db import get_session
from app.models.schemas import AuditLogRecord, ExceptionRecord, MatchRecord
from app.data_gen.generator import GeneratedBundle
from app.services.input_loader import load_ground_truth_from_bytes, load_records_from_bytes
from app.services.reconciliation_service import run_full_reconciliation, run_reconciliation_from_input_dir, run_reconciliation_with_bundle


router = APIRouter(prefix="/api/reconcile", tags=["reconcile"])


@router.post("/run")
def run_reconciliation() -> dict:
    """Run a full reconciliation on generated synthetic data."""
    return run_full_reconciliation()


class FolderRunRequest(BaseModel):
    input_dir: str | None = None


def _load_records(raw: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        return load_records_from_bytes(raw, filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _load_ground_truth(raw: bytes, filename: str) -> dict[str, Any]:
    try:
        return load_ground_truth_from_bytes(raw, filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/upload")
async def upload_reconciliation(
    bank_statement: UploadFile = File(...),
    general_ledger: UploadFile = File(...),
    invoices: UploadFile = File(...),
    bills: UploadFile = File(...),
    ground_truth: UploadFile | None = File(default=None),
) -> dict:
    """Upload custom data files and run reconciliation."""
    bank_payload = _load_records(await bank_statement.read(), bank_statement.filename or "bank_statement.json")
    ledger_payload = _load_records(await general_ledger.read(), general_ledger.filename or "general_ledger.json")
    invoice_payload = _load_records(await invoices.read(), invoices.filename or "invoices.json")
    bill_payload = _load_records(await bills.read(), bills.filename or "bills.json")

    ground_truth_payload = None
    if ground_truth is not None:
        ground_truth_payload = _load_ground_truth(await ground_truth.read(), ground_truth.filename or "ground_truth.json")

    bundle = GeneratedBundle(
        bank_statement=bank_payload,
        general_ledger=ledger_payload,
        invoices=invoice_payload,
        bills=bill_payload,
        ground_truth=ground_truth_payload or {},
    )
    return run_reconciliation_with_bundle(bundle, ground_truth=ground_truth_payload)


@router.post("/run-folder")
def run_reconciliation_from_folder(payload: FolderRunRequest | None = None) -> dict:
    """Run reconciliation from files in a local folder."""
    input_dir = payload.input_dir if payload else None
    try:
        return run_reconciliation_from_input_dir(input_dir)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class ReviewRequest(BaseModel):
    record_id: str
    run_id: str | None = None
    action: str  # APPROVE_MATCH, REJECT_MATCH, MARK_REVIEWED
    notes: str | None = None
    reviewer_name: str | None = "Audit Reviewer"


@router.post("/review")
def review_exception(payload: ReviewRequest) -> dict:
    """Approve, reject, or mark an exception as reviewed."""
    with get_session() as session:
        statement = select(ExceptionRecord).where(ExceptionRecord.record_id == payload.record_id)
        if payload.run_id:
            statement = statement.where(ExceptionRecord.run_id == payload.run_id)
        record = session.exec(statement).first()

        if not record:
            raise HTTPException(status_code=404, detail=f"Exception record '{payload.record_id}' not found.")

        old_status = record.status
        old_review_status = record.review_status

        if payload.action == "APPROVE_MATCH":
            record.status = "MATCHED_HUMAN_APPROVED"
            record.review_status = "APPROVED"
        elif payload.action == "REJECT_MATCH":
            record.status = "UNRECOGNIZED_REJECTED"
            record.review_status = "REJECTED"
        else:
            record.status = "HUMAN_REVIEWED"
            record.review_status = "RESOLVED"

        record.review_notes = payload.notes
        record.reviewed_by = payload.reviewer_name
        record.reviewed_at = datetime.utcnow()

        session.add(record)

        audit_entry = AuditLogRecord(
            run_id=record.run_id,
            record_id=record.record_id,
            action=f"HUMAN_REVIEW_{payload.action}",
            actor=payload.reviewer_name or "Human Auditor",
            comment=payload.notes or f"Decision {payload.action} applied to exception {payload.record_id}.",
            previous_state=f"Status: {old_status}, Review: {old_review_status}",
            new_state=f"Status: {record.status}, Review: {record.review_status}",
        )
        session.add(audit_entry)
        session.commit()
        session.refresh(record)

        return {
            "success": True,
            "record": record.model_dump(),
            "audit_entry": audit_entry.model_dump(),
        }


@router.get("/evidence/{record_id}")
def get_record_evidence(record_id: str) -> dict:
    """Get detailed evidence and AI explanation for a specific record."""
    from app.llm.gemini_client import GeminiClient
    from app.llm.schemas import GroundedExplanation

    with get_session() as session:
        exc = session.exec(select(ExceptionRecord).where(ExceptionRecord.record_id == record_id)).first()
        match = None
        if not exc:
            match = session.exec(
                select(MatchRecord).where(
                    (MatchRecord.source_a_id == record_id) | (MatchRecord.source_b_id == record_id)
                )
            ).first()

        if not exc and not match:
            raise HTTPException(status_code=404, detail=f"No record found for ID '{record_id}'.")

        evidence: dict[str, Any] = {}
        status = "UNKNOWN"
        run_id = ""

        if exc:
            status = exc.status
            run_id = exc.run_id
            if exc.evidence_json:
                try:
                    evidence = json.loads(exc.evidence_json)
                except Exception:
                    evidence = {}
        elif match:
            status = match.match_kind
            run_id = match.run_id
            if match.evidence_json:
                try:
                    evidence = json.loads(match.evidence_json)
                except Exception:
                    evidence = {}

        client = GeminiClient()
        ai_available = client.is_online
        gemini_explanation = None

        payload = {
            "record_id": record_id,
            "status": status,
            "evidence": evidence,
        }

        try:
            explanation_obj = client.structured_call("grounded_explanation", GroundedExplanation, payload)
            gemini_explanation = explanation_obj.model_dump()
        except Exception:
            gemini_explanation = {
                "explanation": "AI explanation unavailable. Structured reconciliation evidence is still available.",
                "confidence": 0.0,
                "evidence_summary": json.dumps(evidence),
                "possible_causes": [],
                "recommended_action": "Inspect structured evidence manually.",
                "certainty": "unknown",
            }
            ai_available = False

        return {
            "record_id": record_id,
            "run_id": run_id,
            "status": status,
            "structured_evidence": evidence,
            "ai_available": ai_available,
            "ai_explanation": gemini_explanation,
            "record_details": exc.model_dump() if exc else (match.model_dump() if match else {}),
        }
