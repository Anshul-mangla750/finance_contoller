from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable
from uuid import uuid4

from app.config import get_settings
from app.llm.gemini_client import GeminiClient
from app.llm.schemas import ExceptionExplanation, LLMMatchBatchDecision
from app.matching.common import MatchCandidate, amount_delta, amount_tolerance, date_distance, parse_date
from app.matching.composite import composite_match_records
from app.matching.exact import exact_match_records
from app.matching.fuzzy import fuzzy_match_records


@dataclass
class PipelineRunResult:
    run_id: str
    matches: list[dict[str, Any]] = field(default_factory=list)
    exceptions: list[dict[str, Any]] = field(default_factory=list)
    matched_source_ids: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    source_totals: dict[str, int] = field(default_factory=dict)


@dataclass
class PairSpec:
    pair_label: str
    left_source_type: str
    right_source_type: str
    left_records: list[dict[str, Any]]
    right_records: list[dict[str, Any]]
    left_id_field: str
    right_id_field: str
    left_date_field: str
    right_date_field: str
    left_text_field: str
    right_text_field: str
    left_link_field: str | None = None
    right_link_field: str | None = None
    allow_composite: bool = False


class ReconciliationPipeline:
    def __init__(self, client: GeminiClient | None = None, confidence_threshold: float | None = None):
        self.settings = get_settings()
        self.client = client or GeminiClient()
        self.confidence_threshold = confidence_threshold or self.settings.llm_confidence_threshold

    def run(
        self,
        bank_records: list[dict[str, Any]],
        ledger_records: list[dict[str, Any]],
        invoices: list[dict[str, Any]],
        bills: list[dict[str, Any]],
    ) -> PipelineRunResult:
        run_id = uuid4().hex
        result = PipelineRunResult(
            run_id=run_id,
            source_totals={
                "bank": len(bank_records),
                "ledger": len(ledger_records),
                "invoice": len(invoices),
                "bill": len(bills),
            },
        )

        pair_specs = [
            PairSpec(
                pair_label="bank_ledger",
                left_source_type="bank",
                right_source_type="ledger",
                left_records=bank_records,
                right_records=ledger_records,
                left_id_field="txn_id",
                right_id_field="entry_id",
                left_date_field="date",
                right_date_field="date",
                left_text_field="description",
                right_text_field="memo",
                right_link_field="linked_bank_txn_id",
                allow_composite=True,
            ),
            PairSpec(
                pair_label="ledger_invoice",
                left_source_type="ledger",
                right_source_type="invoice",
                left_records=ledger_records,
                right_records=invoices,
                left_id_field="entry_id",
                right_id_field="invoice_id",
                left_date_field="date",
                right_date_field="issue_date",
                left_text_field="memo",
                right_text_field="customer",
                left_link_field="linked_document_id",
            ),
            PairSpec(
                pair_label="ledger_bill",
                left_source_type="ledger",
                right_source_type="bill",
                left_records=ledger_records,
                right_records=bills,
                left_id_field="entry_id",
                right_id_field="bill_id",
                left_date_field="date",
                right_date_field="issue_date",
                left_text_field="memo",
                right_text_field="vendor",
                left_link_field="linked_document_id",
            ),
        ]

        for spec in pair_specs:
            pair_matches, matched_left, matched_right = self._run_pair(spec)
            result.matches.extend(pair_matches)
            for record_id in matched_left:
                self._mark_matched(result.matched_source_ids, spec.left_source_type, record_id)
            for record_id in matched_right:
                self._mark_matched(result.matched_source_ids, spec.right_source_type, record_id)

        result.exceptions.extend(
            self._build_exceptions(
                bank_records=bank_records,
                ledger_records=ledger_records,
                invoices=invoices,
                bills=bills,
                matched_source_ids=result.matched_source_ids,
            )
        )
        return result

    def _run_pair(self, spec: PairSpec) -> tuple[list[dict[str, Any]], set[str], set[str]]:
        matches: list[dict[str, Any]] = []

        exact_matches = exact_match_records(
            spec.left_records,
            spec.right_records,
            spec.left_source_type,
            spec.right_source_type,
            spec.left_id_field,
            spec.right_id_field,
            left_date_field=spec.left_date_field,
            right_date_field=spec.right_date_field,
            left_link_field=spec.left_link_field,
            right_link_field=spec.right_link_field,
        )
        matched_left = self._collect_left_ids(exact_matches, composite=False)
        matched_right = self._collect_right_ids(exact_matches)
        matches.extend(self._candidate_to_match_dict(candidate, spec.pair_label) for candidate in exact_matches)

        fuzzy_matches = fuzzy_match_records(
            [record for record in spec.left_records if record[spec.left_id_field] not in matched_left],
            [record for record in spec.right_records if record[spec.right_id_field] not in matched_right],
            spec.left_source_type,
            spec.right_source_type,
            spec.left_id_field,
            spec.right_id_field,
            left_date_field=spec.left_date_field,
            right_date_field=spec.right_date_field,
            left_text_field=spec.left_text_field,
            right_text_field=spec.right_text_field,
            excluded_right_ids=matched_right,
        )
        matched_left.update(self._collect_left_ids(fuzzy_matches, composite=False))
        matched_right.update(self._collect_right_ids(fuzzy_matches))
        matches.extend(self._candidate_to_match_dict(candidate, spec.pair_label) for candidate in fuzzy_matches)

        if spec.allow_composite:
            composite_matches = composite_match_records(
                [record for record in spec.left_records if record[spec.left_id_field] not in matched_left],
                [record for record in spec.right_records if record[spec.right_id_field] not in matched_right],
                left_source_type=spec.left_source_type,
                right_source_type=spec.right_source_type,
                bank_id_field=spec.left_id_field,
                target_id_field=spec.right_id_field,
                bank_date_field=spec.left_date_field,
                target_date_field=spec.right_date_field,
                excluded_bank_ids=matched_left,
                excluded_target_ids=matched_right,
            )
            matched_left.update(self._collect_left_ids(composite_matches, composite=True))
            matched_right.update(self._collect_right_ids(composite_matches))
            matches.extend(self._candidate_to_match_dict(candidate, spec.pair_label) for candidate in composite_matches)

        unresolved_left = [record for record in spec.left_records if record[spec.left_id_field] not in matched_left]
        unresolved_right = [record for record in spec.right_records if record[spec.right_id_field] not in matched_right]
        llm_result = self._run_llm_fallback(spec, unresolved_left, unresolved_right)
        matches.extend(llm_result["matches"])
        matched_left.update(llm_result["matched_left"])
        matched_right.update(llm_result["matched_right"])

        return matches, matched_left, matched_right

    def _run_llm_fallback(
        self,
        spec: PairSpec,
        unresolved_left: list[dict[str, Any]],
        unresolved_right: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not unresolved_left or not unresolved_right:
            return {"matches": [], "matched_left": set(), "matched_right": set()}

        matches: list[dict[str, Any]] = []
        matched_left: set[str] = set()
        matched_right: set[str] = set()
        batch_size = 8
        for batch_start in range(0, len(unresolved_left), batch_size):
            batch = unresolved_left[batch_start : batch_start + batch_size]
            payload = {
                "source_type": spec.left_source_type,
                "target_type": spec.right_source_type,
                "unresolved_records": [
                    self._serialize_record(record, spec.left_source_type, spec.left_id_field, spec.left_date_field, spec.left_text_field)
                    for record in batch
                ],
                "candidate_pool": [
                    self._serialize_record(record, spec.right_source_type, spec.right_id_field, spec.right_date_field, spec.right_text_field)
                    for record in unresolved_right
                ],
                "confidence_threshold": self.confidence_threshold,
            }
            decision_batch = self.client.structured_call("llm_match_batch", LLMMatchBatchDecision, payload)
            for decision in decision_batch.decisions:
                if decision.proposed_match_id is None or decision.confidence < self.confidence_threshold:
                    continue
                left_record = next((record for record in batch if record[spec.left_id_field] == decision.record_id), None)
                right_record = next((record for record in unresolved_right if record[spec.right_id_field] == decision.proposed_match_id), None)
                if left_record is None or right_record is None:
                    continue
                if left_record[spec.left_id_field] in matched_left or right_record[spec.right_id_field] in matched_right:
                    continue
                matches.append(
                    {
                        "source_a_type": spec.left_source_type,
                        "source_a_id": left_record[spec.left_id_field],
                        "source_b_type": spec.right_source_type,
                        "source_b_id": right_record[spec.right_id_field],
                        "match_layer": 4,
                        "match_kind": decision.category,
                        "confidence": round(decision.confidence, 3),
                        "reasoning": decision.reasoning,
                        "pair_type": spec.pair_label,
                    }
                )
                matched_left.add(left_record[spec.left_id_field])
                matched_right.add(right_record[spec.right_id_field])
        return {"matches": matches, "matched_left": matched_left, "matched_right": matched_right}

    def _build_exceptions(
        self,
        bank_records: list[dict[str, Any]],
        ledger_records: list[dict[str, Any]],
        invoices: list[dict[str, Any]],
        bills: list[dict[str, Any]],
        matched_source_ids: dict[str, set[str]],
    ) -> list[dict[str, Any]]:
        exceptions: list[dict[str, Any]] = []
        source_groups = {
            "bank": (
                bank_records,
                self._serialize_counterpart_pool(ledger_records, "ledger", "entry_id", "date", "memo"),
                "txn_id",
                "date",
                "description",
            ),
            "ledger": (
                ledger_records,
                self._serialize_counterpart_pool(bank_records, "bank", "txn_id", "date", "description")
                + self._serialize_counterpart_pool(invoices, "invoice", "invoice_id", "issue_date", "customer")
                + self._serialize_counterpart_pool(bills, "bill", "bill_id", "issue_date", "vendor"),
                "entry_id",
                "date",
                "memo",
            ),
            "invoice": (
                invoices,
                self._serialize_counterpart_pool(ledger_records, "ledger", "entry_id", "date", "memo"),
                "invoice_id",
                "issue_date",
                "customer",
            ),
            "bill": (
                bills,
                self._serialize_counterpart_pool(ledger_records, "ledger", "entry_id", "date", "memo"),
                "bill_id",
                "issue_date",
                "vendor",
            ),
        }

        for source_type, (records, counterpart_pool, id_field, date_field, text_field) in source_groups.items():
            matched_ids = matched_source_ids.get(source_type, set())
            for record in records:
                record_id = record[id_field]
                if record_id in matched_ids:
                    continue
                best = self._best_candidate(record, counterpart_pool, date_field=date_field, text_field=text_field)
                reason_category = self._classify_exception(record, best, matched_source_ids)
                explanation = self._explain_exception(record, reason_category, best)

                status_map = {
                    "missing_counterpart": "MISSING_RECORD",
                    "duplicate_suspected": "DUPLICATE",
                    "amount_mismatch": "AMOUNT_MISMATCH",
                    "date_out_of_tolerance": "DATE_MISMATCH",
                    "unresolved_ambiguous": "NEEDS_HUMAN_REVIEW",
                    "low_confidence_llm": "LOW_CONFIDENCE",
                }
                status = status_map.get(reason_category, "NEEDS_HUMAN_REVIEW")

                evidence = {
                    "referenceMatch": bool(best and best.get("text_similarity", 0) > 0.6),
                    "amountMatch": bool(best and best.get("amount_delta", 999) < 0.01),
                    "amountDifference": float(best["amount_delta"]) if best else float(abs(record.get("amount", 0))),
                    "dateDifference": int(best["date_gap_days"]) if best else 999,
                    "counterpartyMatch": bool(best and best.get("text_similarity", 0) > 0.4),
                    "feeAdjustmentFound": bool(best and 0.0 < best.get("amount_delta", 0) <= 50.0),
                    "taxAdjustmentFound": bool(best and 0.0 < best.get("amount_delta", 0) <= 200.0),
                    "descriptionSimilarity": float(best.get("text_similarity", 0.0)) if best else 0.0,
                }

                exceptions.append(
                    {
                        "source_type": source_type,
                        "record_id": record_id,
                        "best_candidate_type": best["target_type"] if best else None,
                        "best_candidate_id": best["candidate_id"] if best else None,
                        "best_candidate_confidence": best["confidence"] if best else None,
                        "reason_category": reason_category,
                        "status": status,
                        "explanation": explanation["explanation"],
                        "suggested_action": explanation["suggested_action"],
                        "evidence": evidence,
                    }
                )
        return exceptions

    def _best_candidate(
        self,
        record: dict[str, Any],
        counterpart_pool: list[dict[str, Any]],
        date_field: str,
        text_field: str,
    ) -> dict[str, Any] | None:
        best: dict[str, Any] | None = None
        for candidate in counterpart_pool:
            score = self._score_candidate(
                record,
                candidate,
                date_field=date_field,
                text_field=text_field,
            )
            if best is None or score["confidence"] > best["confidence"]:
                best = {
                    "candidate_id": candidate["record_id"],
                    "target_type": candidate["source_type"],
                    **score,
                }
        return best

    def _score_candidate(
        self,
        record: dict[str, Any],
        candidate: dict[str, Any],
        date_field: str,
        text_field: str,
    ) -> dict[str, Any]:
        record_amount = abs(float(record["amount"]))
        candidate_amount = abs(float(candidate["amount"]))
        delta = amount_delta(record_amount, candidate_amount)
        tolerance = amount_tolerance(record_amount)
        amount_score = max(0.0, 1.0 - delta / max(tolerance, 0.01))
        day_gap = date_distance(parse_date(record[date_field]), parse_date(candidate["date"]))
        date_score = max(0.0, 1.0 - min(day_gap, 5) / 5.0)
        text_score = self._text_similarity(str(record.get(text_field, "")), str(candidate.get("text", "")))
        score = (amount_score * 0.5) + (date_score * 0.2) + (text_score * 0.3)
        return {
            "confidence": round(min(1.0, 0.55 + score * 0.45), 3),
            "amount_delta": round(delta, 2),
            "date_gap_days": day_gap,
            "text_similarity": round(text_score, 3),
            "reasoning": (
                f"Closest candidate has amount delta {delta:.2f}, date gap {day_gap} days, "
                f"text similarity {text_score:.2f}."
            ),
        }

    def _classify_exception(
        self,
        record: dict[str, Any],
        best: dict[str, Any] | None,
        matched_source_ids: dict[str, set[str]],
    ) -> str:
        if best is None:
            return "missing_counterpart"
        # Only flag as duplicate if the candidate is genuinely close —
        # low-confidence / large-delta candidates that happen to be matched
        # elsewhere are not duplicates, they're just unmatched records.
        rec_amount = abs(float(record["amount"]))
        tolerance = amount_tolerance(rec_amount)
        is_close_enough = (
            best["confidence"] >= 0.6
            and best["amount_delta"] <= tolerance * 2
            and best["date_gap_days"] <= 10
        )
        if best["candidate_id"] in matched_source_ids.get(best["target_type"], set()) and is_close_enough:
            return "duplicate_suspected"
        if best["amount_delta"] > tolerance:
            return "amount_mismatch"
        if best["date_gap_days"] > 5:
            return "date_out_of_tolerance"
        if best["confidence"] < self.confidence_threshold:
            return "unresolved_ambiguous"
        return "low_confidence_llm"

    def _explain_exception(self, record: dict[str, Any], reason_category: str, best: dict[str, Any] | None) -> dict[str, Any]:
        payload = {
            "record": {
                "record_id": self._record_id(record),
                **self._serialize_any_record(record),
            },
            "reason_category": reason_category,
            "best_candidate": best,
        }
        return self.client.structured_call("exception_explanation", ExceptionExplanation, payload).model_dump()

    def _serialize_record(
        self,
        record: dict[str, Any],
        source_type: str,
        id_field: str,
        date_field: str,
        text_field: str,
    ) -> dict[str, Any]:
        return {
            "record_id": record[id_field],
            "source_type": source_type,
            "amount": float(record["amount"]),
            "date": str(record[date_field]),
            "text": str(record.get(text_field, "")),
        }

    def _serialize_counterpart_pool(
        self,
        records: list[dict[str, Any]],
        source_type: str,
        id_field: str,
        date_field: str,
        text_field: str,
    ) -> list[dict[str, Any]]:
        return [self._serialize_record(record, source_type, id_field, date_field, text_field) for record in records]

    def _serialize_any_record(self, record: dict[str, Any]) -> dict[str, Any]:
        return {key: (value.isoformat() if hasattr(value, "isoformat") else value) for key, value in record.items()}

    def _record_id(self, record: dict[str, Any]) -> str:
        for key in ("txn_id", "entry_id", "invoice_id", "bill_id"):
            if key in record:
                return str(record[key])
        return "unknown"

    def _candidate_to_match_dict(self, candidate: MatchCandidate, pair_type: str) -> dict[str, Any]:
        return {
            "source_a_type": candidate.left_type,
            "source_a_id": candidate.left_id,
            "source_b_type": candidate.right_type,
            "source_b_id": candidate.right_id,
            "match_layer": candidate.layer,
            "match_kind": candidate.kind,
            "confidence": round(candidate.confidence, 3),
            "reasoning": candidate.reasoning,
            "pair_type": pair_type,
            "status": "MATCHED_AFTER_ADJUSTMENT" if candidate.kind in ("fee_adjusted", "split_payment") else "MATCHED",
            "evidence": {
                "referenceMatch": True,
                "amountMatch": candidate.kind not in ("fee_adjusted", "split_payment"),
                "amountDifference": candidate.metadata.get("fee", 0.0) if candidate.kind == "fee_adjusted" else 0.0,
                "dateDifference": 0,
                "counterpartyMatch": True,
                "feeAdjustmentFound": candidate.kind == "fee_adjusted",
                "taxAdjustmentFound": False,
                "descriptionSimilarity": 0.95,
            },
        }

    def _collect_left_ids(self, candidates: Iterable[MatchCandidate], composite: bool) -> set[str]:
        ids: set[str] = set()
        for candidate in candidates:
            if composite and candidate.kind == "split_payment":
                ids.update(candidate.metadata.get("bank_ids", []))
            else:
                ids.add(candidate.left_id)
        return ids

    def _collect_right_ids(self, candidates: Iterable[MatchCandidate]) -> set[str]:
        return {candidate.right_id for candidate in candidates}

    def _mark_matched(self, matched_source_ids: dict[str, set[str]], source_type: str, record_id: str) -> None:
        matched_source_ids.setdefault(source_type, set()).add(record_id)

    def _text_similarity(self, left: str, right: str) -> float:
        if not left or not right:
            return 0.0
        left_tokens = set(left.lower().split())
        right_tokens = set(right.lower().split())
        if not left_tokens or not right_tokens:
            return 0.0
        return round(len(left_tokens & right_tokens) / len(left_tokens | right_tokens), 3)
