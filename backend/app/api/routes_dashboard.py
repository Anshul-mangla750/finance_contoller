from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.db import get_session
from app.models.schemas import AuditLogRecord, BankTxn, Bill, ExceptionRecord, Invoice, MatchRecord, ReconciliationRun


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _latest_run() -> ReconciliationRun:
    with get_session() as session:
        run = session.exec(select(ReconciliationRun).order_by(ReconciliationRun.created_at.desc())).first()
        if run is None:
            raise HTTPException(status_code=404, detail="No reconciliation run available. Run /api/reconcile/run first.")
        return run


@router.get("/kpis")
def get_kpis() -> dict:
    run = _latest_run()
    return {
        "records_processed": run.total_records,
        "match_rate": run.match_rate,
        "precision": run.precision,
        "recall": run.recall,
        "f1": run.f1,
        "cash_position": run.cash_position,
        "exception_count": run.exception_count,
        "checksum_ok": run.checksum_ok,
    }


@router.get("/accuracy")
def get_accuracy() -> dict:
    run = _latest_run()
    return json.loads(run.metrics_json)


@router.get("/matches")
def get_matches(page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=1, le=200)) -> dict:
    with get_session() as session:
        rows = session.exec(select(MatchRecord).order_by(MatchRecord.id)).all()
    start = (page - 1) * page_size
    end = start + page_size
    items = rows[start:end]
    return {
        "page": page,
        "page_size": page_size,
        "total": len(rows),
        "items": [item.model_dump() for item in items],
    }


@router.get("/exceptions")
def get_exceptions(
    source: str | None = None,
    reason_category: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict:
    with get_session() as session:
        statement = select(ExceptionRecord).order_by(ExceptionRecord.id)
        if source:
            statement = statement.where(ExceptionRecord.source_type == source)
        if reason_category:
            statement = statement.where(ExceptionRecord.reason_category == reason_category)
        rows = session.exec(statement).all()
    start = (page - 1) * page_size
    end = start + page_size
    items = rows[start:end]
    return {
        "page": page,
        "page_size": page_size,
        "total": len(rows),
        "items": [item.model_dump() for item in items],
    }


@router.get("/latest-run")
def get_latest_run() -> dict:
    cache = get_latest_run_cache()
    if cache:
        return cache["response"]
    run = _latest_run()
    with get_session() as session:
        matches = session.exec(select(MatchRecord).where(MatchRecord.run_id == run.id).order_by(MatchRecord.id)).all()
        exceptions = session.exec(select(ExceptionRecord).where(ExceptionRecord.run_id == run.id).order_by(ExceptionRecord.id)).all()
    return {
        "run_id": run.id,
        "kpis": {
            "records_processed": run.total_records,
            "match_rate": run.match_rate,
            "precision": run.precision,
            "recall": run.recall,
            "f1": run.f1,
            "cash_position": run.cash_position,
            "exception_count": run.exception_count,
            "checksum_ok": run.checksum_ok,
        },
        "accuracy": json.loads(run.metrics_json),
        "matches": [item.model_dump() for item in matches],
        "exceptions": [item.model_dump() for item in exceptions],
    }


@router.get("/runs")
def list_runs() -> dict:
    with get_session() as session:
        runs = session.exec(select(ReconciliationRun).order_by(ReconciliationRun.created_at.desc())).all()
    return {
        "total": len(runs),
        "items": [
            {
                "run_id": r.id,
                "seed": r.seed,
                "created_at": r.created_at.isoformat(),
                "total_records": r.total_records,
                "matched_count": r.matched_count,
                "exception_count": r.exception_count,
                "match_rate": r.match_rate,
                "precision": r.precision,
                "recall": r.recall,
                "cash_position": r.cash_position,
            }
            for r in runs
        ],
    }


@router.get("/runs/{run_id}")
def get_run_details(run_id: str) -> dict:
    with get_session() as session:
        run = session.exec(select(ReconciliationRun).where(ReconciliationRun.id == run_id)).first()
        if not run:
            raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
        matches = session.exec(select(MatchRecord).where(MatchRecord.run_id == run.id).order_by(MatchRecord.id)).all()
        exceptions = session.exec(select(ExceptionRecord).where(ExceptionRecord.run_id == run.id).order_by(ExceptionRecord.id)).all()
    return {
        "run_id": run.id,
        "kpis": {
            "records_processed": run.total_records,
            "match_rate": run.match_rate,
            "precision": run.precision,
            "recall": run.recall,
            "f1": run.f1,
            "cash_position": run.cash_position,
            "exception_count": run.exception_count,
            "checksum_ok": run.checksum_ok,
        },
        "accuracy": json.loads(run.metrics_json),
        "matches": [item.model_dump() for item in matches],
        "exceptions": [item.model_dump() for item in exceptions],
    }


@router.get("/cash-details")
def get_cash_details() -> dict:
    with get_session() as session:
        bank_txns = session.exec(select(BankTxn).order_by(BankTxn.date.asc())).all()
        invoices = session.exec(select(Invoice)).all()
        bills = session.exec(select(Bill)).all()
        matches = session.exec(select(MatchRecord)).all()
        exceptions = session.exec(select(ExceptionRecord)).all()

    matched_bank_ids = {m.source_a_id for m in matches if m.source_a_type == "bank"}.union(
        {m.source_b_id for m in matches if m.source_b_type == "bank"}
    )
    matched_invoice_ids = {m.source_a_id for m in matches if m.source_a_type == "invoice"}.union(
        {m.source_b_id for m in matches if m.source_b_type == "invoice"}
    )
    matched_bill_ids = {m.source_a_id for m in matches if m.source_a_type == "bill"}.union(
        {m.source_b_id for m in matches if m.source_b_type == "bill"}
    )

    opening_balance = (bank_txns[0].running_balance - bank_txns[0].amount) if bank_txns else 0.0
    latest_cash = bank_txns[-1].running_balance if bank_txns else 0.0

    inflows = [t for t in bank_txns if t.amount > 0 and t.txn_id in matched_bank_ids]
    outflows = [t for t in bank_txns if t.amount < 0 and t.txn_id in matched_bank_ids]
    unreconciled_txns = [t for t in bank_txns if t.txn_id not in matched_bank_ids]

    pending_invoices = [inv for inv in invoices if inv.invoice_id not in matched_invoice_ids]
    pending_bills = [b for b in bills if b.bill_id not in matched_bill_ids]

    confirmed_inflows_total = sum(t.amount for t in inflows)
    confirmed_outflows_total = sum(abs(t.amount) for t in outflows)
    unreconciled_total = sum(abs(t.amount) for t in unreconciled_txns)

    pending_incoming_total = sum(inv.amount for inv in pending_invoices)
    pending_outgoing_total = sum(b.amount for b in pending_bills)

    at_risk_exceptions = [e for e in exceptions if e.reason_category in ("amount_mismatch", "duplicate_suspected")]
    at_risk_total = sum(
        abs(next((t.amount for t in bank_txns if t.txn_id == e.record_id), 5000.0))
        for e in at_risk_exceptions
    )

    return {
        "summary": {
            "opening_balance": round(opening_balance, 2),
            "confirmed_inflows": round(confirmed_inflows_total, 2),
            "confirmed_outflows": round(confirmed_outflows_total, 2),
            "current_cash": round(latest_cash, 2),
            "pending_incoming": round(pending_incoming_total, 2),
            "pending_outgoing": round(pending_outgoing_total, 2),
            "unreconciled_amount": round(unreconciled_total, 2),
            "at_risk_amount": round(at_risk_total, 2),
        },
        "traceability": {
            "inflows": [
                {
                    "txn_id": t.txn_id,
                    "date": str(t.date),
                    "amount": t.amount,
                    "description": t.description,
                    "running_balance": t.running_balance,
                    "status": "CONFIRMED_INFLOW",
                }
                for t in inflows
            ],
            "outflows": [
                {
                    "txn_id": t.txn_id,
                    "date": str(t.date),
                    "amount": t.amount,
                    "description": t.description,
                    "running_balance": t.running_balance,
                    "status": "CONFIRMED_OUTFLOW",
                }
                for t in outflows
            ],
            "unreconciled": [
                {
                    "txn_id": t.txn_id,
                    "date": str(t.date),
                    "amount": t.amount,
                    "description": t.description,
                    "running_balance": t.running_balance,
                    "status": "UNRECONCILED",
                }
                for t in unreconciled_txns
            ],
            "pending_invoices": [
                {
                    "invoice_id": inv.invoice_id,
                    "customer": inv.customer,
                    "amount": inv.amount,
                    "issue_date": str(inv.issue_date),
                    "due_date": str(inv.due_date),
                    "status": "PENDING_INCOMING",
                }
                for inv in pending_invoices
            ],
            "pending_bills": [
                {
                    "bill_id": b.bill_id,
                    "vendor": b.vendor,
                    "amount": b.amount,
                    "issue_date": str(b.issue_date),
                    "due_date": str(b.due_date),
                    "status": "PENDING_OUTGOING",
                }
                for b in pending_bills
            ],
        },
    }


@router.get("/audit-logs")
def get_audit_logs(limit: int = Query(default=50, ge=1, le=200)) -> dict:
    with get_session() as session:
        logs = session.exec(select(AuditLogRecord).order_by(AuditLogRecord.timestamp.desc()).limit(limit)).all()
    return {
        "total": len(logs),
        "items": [log.model_dump() for log in logs],
    }

from app.services.reconciliation_service import get_latest_run_cache

