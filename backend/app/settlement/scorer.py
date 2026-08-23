from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass
class ScoreReport:
    match_rate: float
    precision: float
    recall: float
    f1: float
    total_records: int
    matched_records: int
    pair_precision: dict[str, float]
    pair_recall: dict[str, float]
    pair_f1: dict[str, float]
    true_orphans: int
    engine_misses: int


def _truth_pairs(ground_truth: list[dict[str, Any]]) -> dict[str, set[tuple[str, str]]]:
    pairs: dict[str, set[tuple[str, str]]] = {
        "settlement_bank": set(),
        "settlement_order": set(),
    }
    for row in ground_truth:
        source_role = row["source_role"]
        record_id = row["record_id"]
        matched_source_role = row["matched_source_role"]
        matched_ids = [item for item in str(row.get("matched_record_ids", "")).split("|") if item]
        if not matched_ids:
            continue
        if source_role == "settlement" and matched_source_role == "bank":
            for matched_id in matched_ids:
                pairs["settlement_bank"].add((record_id, matched_id))
        if source_role == "settlement" and matched_source_role == "order":
            for matched_id in matched_ids:
                pairs["settlement_order"].add((record_id, matched_id))
        if source_role == "bank" and matched_source_role == "settlement":
            for matched_id in matched_ids:
                pairs["settlement_bank"].add((matched_id, record_id))
        if source_role == "order" and matched_source_role == "settlement":
            for matched_id in matched_ids:
                pairs["settlement_order"].add((matched_id, record_id))
    return pairs


def _predicted_pairs(matches: list[dict[str, Any]]) -> dict[str, set[tuple[str, str]]]:
    pairs: dict[str, set[tuple[str, str]]] = {
        "settlement_bank": set(),
        "settlement_order": set(),
    }
    for match in matches:
        pair_type = match["pair_type"]
        left_ids = match.get("left_record_ids", [])
        right_ids = match.get("right_record_ids", [])
        if pair_type == "settlement_bank":
            for left_id in left_ids:
                for right_id in right_ids:
                    pairs[pair_type].add((left_id, right_id))
        elif pair_type == "settlement_order":
            for left_id in left_ids:
                for right_id in right_ids:
                    pairs[pair_type].add((left_id, right_id))
    return pairs


def score_against_ground_truth(result: dict[str, Any], ground_truth: list[dict[str, Any]]) -> ScoreReport:
    truth_pairs = _truth_pairs(ground_truth)
    predicted_pairs = _predicted_pairs(result["matches"])
    all_truth = truth_pairs["settlement_bank"] | truth_pairs["settlement_order"]
    all_predicted = predicted_pairs["settlement_bank"] | predicted_pairs["settlement_order"]

    true_positive = len(all_truth & all_predicted)
    precision = true_positive / len(all_predicted) if all_predicted else 0.0
    recall = true_positive / len(all_truth) if all_truth else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0

    pair_precision: dict[str, float] = {}
    pair_recall: dict[str, float] = {}
    pair_f1: dict[str, float] = {}
    for pair_type in ("settlement_bank", "settlement_order"):
        truth = truth_pairs[pair_type]
        predicted = predicted_pairs[pair_type]
        tp = len(truth & predicted)
        pair_precision[pair_type] = tp / len(predicted) if predicted else 0.0
        pair_recall[pair_type] = tp / len(truth) if truth else 0.0
        denominator = pair_precision[pair_type] + pair_recall[pair_type]
        pair_f1[pair_type] = (2 * pair_precision[pair_type] * pair_recall[pair_type] / denominator) if denominator else 0.0

    matched_records = len(set(result["matched_record_ids"].get("settlement", []))) + len(
        set(result["matched_record_ids"].get("bank", []))
    ) + len(set(result["matched_record_ids"].get("order", [])))
    total_records = result["metrics"]["records_processed"]

    truth_index = {
        (row["source_role"], row["record_id"]): row for row in ground_truth
    }
    true_orphans = 0
    engine_misses = 0
    for exception in result["exceptions"]:
        entry = truth_index.get((exception["source_role"], exception["record_id"]))
        if entry and entry.get("is_true_orphan"):
            true_orphans += 1
        else:
            engine_misses += 1

    return ScoreReport(
        match_rate=round(matched_records / total_records, 3) if total_records else 0.0,
        precision=round(precision, 3),
        recall=round(recall, 3),
        f1=round(f1, 3),
        total_records=total_records,
        matched_records=matched_records,
        pair_precision={key: round(value, 3) for key, value in pair_precision.items()},
        pair_recall={key: round(value, 3) for key, value in pair_recall.items()},
        pair_f1={key: round(value, 3) for key, value in pair_f1.items()},
        true_orphans=true_orphans,
        engine_misses=engine_misses,
    )

