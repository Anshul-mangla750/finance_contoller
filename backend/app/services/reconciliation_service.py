from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

from sqlalchemy import delete

from app.config import get_settings
from app.data_gen.generator import GeneratedBundle, generate_and_save
from app.db import get_session, init_db
from app.models.schemas import AuditLogRecord, BankTxn, Bill, ExceptionRecord, Invoice, LedgerEntry, MatchRecord, ReconciliationRun
from app.matching.pipeline import ReconciliationPipeline
from app.services.input_loader import load_bundle_from_directory
from app.rag.ingest import ingest_reconciliation_state
from app.scoring.scorer import AccuracyScorer


LATEST_RUN_CACHE: dict[str, Any] | None = None


def _cash_position(bank_records: list[dict[str, Any]]) -> float:
    if not bank_records:
        return 0.0
    ordered = sorted(bank_records, key=lambda item: (item["date"], item["txn_id"]))
    return float(ordered[-1]["running_balance"])


def _persist_bundle(session, bundle: GeneratedBundle) -> None:
    session.exec(delete(BankTxn))
    session.exec(delete(LedgerEntry))
    session.exec(delete(Invoice))
    session.exec(delete(Bill))
    session.exec(delete(MatchRecord))
    session.exec(delete(ExceptionRecord))
    session.exec(delete(ReconciliationRun))
    session.commit()

    session.add_all(BankTxn.model_validate(item) for item in bundle.bank_statement)
    session.add_all(LedgerEntry.model_validate(item) for item in bundle.general_ledger)
    session.add_all(Invoice.model_validate(item) for item in bundle.invoices)
    session.add_all(Bill.model_validate(item) for item in bundle.bills)
    session.commit()


def _checksum(pipeline_result, source_totals: dict[str, int]) -> dict[str, Any]:
    checksum = {
        source: {
            "total": source_totals.get(source, 0),
            "matched": len(pipeline_result.matched_source_ids.get(source, set())),
            "exceptions": sum(1 for item in pipeline_result.exceptions if item["source_type"] == source),
            "ok": source_totals.get(source, 0)
            == len(pipeline_result.matched_source_ids.get(source, set()))
            + sum(1 for item in pipeline_result.exceptions if item["source_type"] == source),
        }
        for source in ["bank", "ledger", "invoice", "bill"]
    }
    checksum["ok"] = all(item["ok"] for item in checksum.values())
    return checksum


def _build_accuracy_payload(
    pipeline_result,
    source_totals: dict[str, int],
    cash_position: float,
    report: Any | None,
) -> dict[str, Any]:
    total_records = sum(source_totals.values())
    matched_count = sum(len(ids) for ids in pipeline_result.matched_source_ids.values())
    checksum = _checksum(pipeline_result, source_totals)
    if report is None:
        return {
            "available": False,
            "overall_match_rate": round(matched_count / total_records, 3) if total_records else 0.0,
            "precision": None,
            "recall": None,
            "f1": None,
            "per_pair": {},
            "calibration_table": [],
            "checksum": checksum,
            "total_records": total_records,
            "matched_count": matched_count,
            "exception_count": len(pipeline_result.exceptions),
            "cash_position": round(cash_position, 2),
        }
    payload = asdict(report)
    payload["available"] = True
    payload["checksum"] = checksum
    return payload


def _persist_results(
    session,
    run_id: str,
    pipeline_result,
    accuracy_payload: dict[str, Any],
    cash_position: float,
    seed: int,
) -> None:
    session.add_all(
        MatchRecord(
            run_id=run_id,
            source_a_type=item["source_a_type"],
            source_a_id=item["source_a_id"],
            source_b_type=item["source_b_type"],
            source_b_id=item["source_b_id"],
            match_layer=item["match_layer"],
            match_kind=item["match_kind"],
            confidence=item["confidence"],
            reasoning=item["reasoning"],
            evidence_json=json.dumps(item.get("evidence", {})),
        )
        for item in pipeline_result.matches
    )
    session.add_all(
        ExceptionRecord(
            run_id=run_id,
            source_type=item["source_type"],
            record_id=item["record_id"],
            best_candidate_type=item.get("best_candidate_type"),
            best_candidate_id=item.get("best_candidate_id"),
            best_candidate_confidence=item.get("best_candidate_confidence"),
            reason_category=item["reason_category"],
            status=item.get("status", "NEEDS_HUMAN_REVIEW"),
            explanation=item["explanation"],
            suggested_action=item["suggested_action"],
            evidence_json=json.dumps(item.get("evidence", {})),
            review_status="OPEN",
        )
        for item in pipeline_result.exceptions
    )
    session.add(
        ReconciliationRun(
            id=run_id,
            seed=seed,
            total_records=accuracy_payload["total_records"],
            matched_count=accuracy_payload["matched_count"],
            exception_count=accuracy_payload["exception_count"],
            checksum_ok=accuracy_payload["checksum"]["ok"],
            match_rate=accuracy_payload["overall_match_rate"],
            precision=accuracy_payload["precision"] or 0.0,
            recall=accuracy_payload["recall"] or 0.0,
            f1=accuracy_payload["f1"] or 0.0,
            cash_position=cash_position,
            metrics_json=json.dumps(accuracy_payload, indent=2, sort_keys=True),
        )
    )
    session.add(
        AuditLogRecord(
            run_id=run_id,
            action="RECONCILIATION_RUN_COMPLETED",
            actor="System Pipeline",
            comment=f"Processed {accuracy_payload['total_records']} records. Matched: {accuracy_payload['matched_count']}, Exceptions: {accuracy_payload['exception_count']}.",
            new_state=f"Match Rate: {round(accuracy_payload['overall_match_rate'] * 100, 1)}%",
        )
    )
    session.commit()



def run_reconciliation_with_bundle(
    bundle: GeneratedBundle,
    seed: int | None = None,
    ground_truth: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    init_db()
    pipeline = ReconciliationPipeline()

    with get_session() as session:
        _persist_bundle(session, bundle)

    pipeline_result = pipeline.run(
        bank_records=bundle.bank_statement,
        ledger_records=bundle.general_ledger,
        invoices=bundle.invoices,
        bills=bundle.bills,
    )
    cash_position = _cash_position(bundle.bank_statement)
    report = None
    if ground_truth is not None:
        scorer = AccuracyScorer(ground_truth)
        report = scorer.score(pipeline_result, pipeline_result.source_totals, cash_position)

    accuracy_payload = _build_accuracy_payload(pipeline_result, pipeline_result.source_totals, cash_position, report)

    with get_session() as session:
        _persist_results(session, pipeline_result.run_id, pipeline_result, accuracy_payload, cash_position, seed or settings.seed)

    ingest_reconciliation_state(
        bundle.bank_statement,
        bundle.general_ledger,
        bundle.invoices,
        bundle.bills,
        pipeline_result.matches,
        pipeline_result.exceptions,
    )

    response = {
        "run_id": pipeline_result.run_id,
        "kpis": {
            "records_processed": accuracy_payload["total_records"],
            "match_rate": accuracy_payload["overall_match_rate"],
            "precision": accuracy_payload["precision"],
            "recall": accuracy_payload["recall"],
            "f1": accuracy_payload["f1"],
            "cash_position": accuracy_payload["cash_position"],
            "exception_count": accuracy_payload["exception_count"],
            "checksum_ok": accuracy_payload["checksum"]["ok"],
            "scoring_available": accuracy_payload["available"],
        },
        "accuracy": accuracy_payload,
        "matches": pipeline_result.matches,
        "exceptions": pipeline_result.exceptions,
    }

    global LATEST_RUN_CACHE
    LATEST_RUN_CACHE = {
        "response": response,
        "bundle": bundle,
        "pipeline_result": pipeline_result,
        "report": report,
    }
    return response


def run_full_reconciliation(seed: int | None = None) -> dict[str, Any]:
    settings = get_settings()
    bundle = generate_and_save(seed=seed, out_dir=settings.generated_dir)
    return run_reconciliation_with_bundle(bundle, seed=seed, ground_truth=bundle.ground_truth)


def run_reconciliation_from_input_dir(input_dir: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    bundle, ground_truth = load_bundle_from_directory(input_dir or settings.input_dir)
    return run_reconciliation_with_bundle(bundle, ground_truth=ground_truth)


def get_latest_run_cache() -> dict[str, Any] | None:
    return LATEST_RUN_CACHE
