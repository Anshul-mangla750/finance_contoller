from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.matching.common import bucket_confidence


PAIR_TYPES = ("bank_ledger", "ledger_invoice", "ledger_bill")


@dataclass
class ScoringReport:
    overall_match_rate: float
    precision: float
    recall: float
    f1: float
    per_pair: dict[str, dict[str, Any]]
    calibration_table: list[dict[str, Any]]
    checksum: dict[str, Any]
    total_records: int
    matched_count: int
    exception_count: int
    cash_position: float


def normalize_pair_type(source_type: str, counterpart_type: str) -> str | None:
    if {source_type, counterpart_type} == {"bank", "ledger"}:
        return "bank_ledger"
    if {source_type, counterpart_type} == {"ledger", "invoice"}:
        return "ledger_invoice"
    if {source_type, counterpart_type} == {"ledger", "bill"}:
        return "ledger_bill"
    return None


def build_truth_pair_sets(ground_truth: dict[str, Any]) -> dict[str, set[tuple[str, str]]]:
    truth_pairs: dict[str, set[tuple[str, str]]] = {pair_type: set() for pair_type in PAIR_TYPES}
    for key, entry in ground_truth.get("record_truth", {}).items():
        source_type, record_id = key.split(":", 1)
        for counterpart in entry.get("counterparts", []):
            pair_type = normalize_pair_type(source_type, counterpart["source_type"])
            if pair_type is None:
                continue
            if pair_type == "bank_ledger":
                if source_type == "bank":
                    truth_pairs[pair_type].add((record_id, counterpart["record_id"]))
                else:
                    truth_pairs[pair_type].add((counterpart["record_id"], record_id))
            elif pair_type == "ledger_invoice":
                if source_type == "ledger":
                    truth_pairs[pair_type].add((record_id, counterpart["record_id"]))
                else:
                    truth_pairs[pair_type].add((counterpart["record_id"], record_id))
            elif pair_type == "ledger_bill":
                if source_type == "ledger":
                    truth_pairs[pair_type].add((record_id, counterpart["record_id"]))
                else:
                    truth_pairs[pair_type].add((counterpart["record_id"], record_id))
    return truth_pairs


def expand_predicted_pairs(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    for match in matches:
        source_a_ids = [item.strip() for item in str(match["source_a_id"]).split(",") if item.strip()]
        for source_a_id in source_a_ids:
            expanded.append(
                {
                    "pair_type": match["pair_type"],
                    "source_a_type": match["source_a_type"],
                    "source_a_id": source_a_id,
                    "source_b_type": match["source_b_type"],
                    "source_b_id": match["source_b_id"],
                    "confidence": float(match["confidence"]),
                    "match_layer": int(match["match_layer"]),
                    "reasoning": match["reasoning"],
                }
            )
    return expanded


def compute_calibration_table(predicted_pairs: list[dict[str, Any]], truth_pairs: dict[str, set[tuple[str, str]]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[bool]] = defaultdict(list)
    for match in predicted_pairs:
        bucket = bucket_confidence(float(match["confidence"]))
        key = (match["source_a_id"], match["source_b_id"])
        buckets[bucket].append(key in truth_pairs.get(match["pair_type"], set()))
    rows: list[dict[str, Any]] = []
    for bucket_name in ["0.95-1.0", "0.85-0.95", "0.75-0.85", "0.60-0.75", "below_0.60"]:
        outcomes = buckets.get(bucket_name, [])
        accuracy = (sum(outcomes) / len(outcomes)) if outcomes else 0.0
        rows.append(
            {
                "confidence_bucket": bucket_name,
                "predictions": len(outcomes),
                "actual_accuracy": round(accuracy, 3),
            }
        )
    return rows


class AccuracyScorer:
    def __init__(self, ground_truth: dict[str, Any]):
        self.ground_truth = ground_truth
        self.truth_pairs = build_truth_pair_sets(ground_truth)

    def score(self, pipeline_result: Any, source_totals: dict[str, int], cash_position: float) -> ScoringReport:
        predicted_pairs = expand_predicted_pairs(pipeline_result.matches)
        predicted_pair_set = {
            (match["pair_type"], match["source_a_id"], match["source_b_id"])
            for match in predicted_pairs
        }
        truth_pair_set = {
            (pair_type, left_id, right_id)
            for pair_type, pairs in self.truth_pairs.items()
            for left_id, right_id in pairs
        }
        true_positive = len(predicted_pair_set & truth_pair_set)
        precision = true_positive / len(predicted_pair_set) if predicted_pair_set else 0.0
        recall = true_positive / len(truth_pair_set) if truth_pair_set else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0

        per_pair: dict[str, dict[str, Any]] = {}
        for pair_type in PAIR_TYPES:
            pair_truth = self.truth_pairs.get(pair_type, set())
            pair_predictions = [match for match in predicted_pairs if match["pair_type"] == pair_type]
            pair_prediction_set = {(match["source_a_id"], match["source_b_id"]) for match in pair_predictions}
            pair_tp = len(pair_prediction_set & pair_truth)
            pair_precision = pair_tp / len(pair_prediction_set) if pair_prediction_set else 0.0
            pair_recall = pair_tp / len(pair_truth) if pair_truth else 0.0
            pair_f1 = (2 * pair_precision * pair_recall / (pair_precision + pair_recall)) if pair_precision + pair_recall else 0.0
            per_pair[pair_type] = {
                "truth_count": len(pair_truth),
                "predicted_count": len(pair_prediction_set),
                "correct_count": pair_tp,
                "precision": round(pair_precision, 3),
                "recall": round(pair_recall, 3),
                "f1": round(pair_f1, 3),
                "match_rate": round(pair_recall, 3),
            }

        matched_count = sum(len(ids) for ids in pipeline_result.matched_source_ids.values())
        total_records = sum(source_totals.values())
        exception_count = len(pipeline_result.exceptions)
        overall_match_rate = matched_count / total_records if total_records else 0.0
        calibration_table = compute_calibration_table(predicted_pairs, self.truth_pairs)

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
        if not checksum["ok"]:
            raise ValueError("Reconciliation checksum failed: totals do not reconcile.")

        return ScoringReport(
            overall_match_rate=round(overall_match_rate, 3),
            precision=round(precision, 3),
            recall=round(recall, 3),
            f1=round(f1, 3),
            per_pair=per_pair,
            calibration_table=calibration_table,
            checksum=checksum,
            total_records=total_records,
            matched_count=matched_count,
            exception_count=exception_count,
            cash_position=round(cash_position, 2),
        )

