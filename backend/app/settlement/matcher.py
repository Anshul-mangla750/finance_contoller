from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from itertools import combinations
from math import isclose
from time import perf_counter
from typing import Any, Iterable

from rapidfuzz import fuzz

from app.settlement.loader import LoadedBundle
from app.settlement.utils import format_inr_amount, parse_date_value


def _amount_tolerance(amount: float) -> float:
    return max(1.5, round(abs(amount) * 0.02, 2))


def _date_delta(left: date, right: date) -> int:
    return abs((left - right).days)


def _score_reason(confidence: float, tier: int) -> str:
    tier_names = {
        1: "reference-number exact match",
        2: "amount exact with date tolerance",
        3: "probabilistic match",
        4: "many-to-one grouping",
    }
    return f"Tier {tier}: {tier_names.get(tier, 'match')} accepted at {confidence:.1f}% confidence."


def _token_similarity(left: str | None, right: str | None) -> float:
    if not left or not right:
        return 0.0
    return fuzz.token_set_ratio(left, right) / 100.0


def _normalize_amount(value: float) -> float:
    return abs(round(float(value), 2))


def _counterpart_amount(counterpart: dict[str, Any], counterpart_role: str) -> float:
    if counterpart_role == "settlement":
        return float(counterpart.get("net_amount", counterpart.get("amount", 0.0)))
    return float(counterpart.get("normalized_amount", counterpart.get("amount", 0.0)))


def _counterpart_date(counterpart: dict[str, Any], counterpart_role: str) -> date:
    if counterpart_role == "bank":
        return counterpart["statement_date"]
    if counterpart_role == "order":
        return counterpart["order_date"]
    return counterpart["payout_date"]


def _build_candidate(
    settlement: dict[str, Any],
    counterpart: dict[str, Any],
    counterpart_role: str,
    tier: int,
    confidence: float,
    amount_delta: float,
    date_delta: int,
    description_similarity: float,
    matched_by: str,
    component_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "settlement_id": settlement["record_id"],
        "counterpart_id": counterpart["record_id"],
        "counterpart_role": counterpart_role,
        "tier": tier,
        "confidence": round(confidence, 1),
        "matched_by": matched_by,
        "component_ids": component_ids or [counterpart["record_id"]],
        "evidence": {
            "settlement_record_id": settlement["record_id"],
            "counterpart_record_ids": component_ids or [counterpart["record_id"]],
            "matched_fields": {
                "reference_number": settlement.get("reference_number") if matched_by == "reference" else None,
                "amount": {
                    "settlement": settlement["net_amount"],
                    "counterpart": _counterpart_amount(counterpart, counterpart_role),
                    "delta": round(amount_delta, 2),
                    "tolerance": round(_amount_tolerance(settlement["net_amount"]), 2),
                },
                "date": {
                    "settlement": settlement["payout_date"].isoformat(),
                    "counterpart": _counterpart_date(counterpart, counterpart_role).isoformat(),
                    "delta_days": int(date_delta),
                    "tolerance_days": 3 if tier in (1, 2) else 7,
                },
                "description_similarity": round(description_similarity, 3),
            },
            "matched_by": matched_by,
            "tier": tier,
            "rule_based": tier in (1, 2, 4),
            "inferred": tier == 3,
        },
    }


def _score_single_candidate(
    settlement: dict[str, Any],
    counterpart: dict[str, Any],
    counterpart_role: str,
    tolerance_days: int,
) -> dict[str, Any] | None:
    settlement_ref = (settlement.get("reference_number") or "").strip()
    counterpart_ref = (counterpart.get("reference_number") or "").strip()
    settlement_date = settlement["payout_date"]
    counterpart_date = _counterpart_date(counterpart, counterpart_role)
    amount = _counterpart_amount(counterpart, counterpart_role)
    amount_delta = abs(_normalize_amount(settlement["net_amount"]) - _normalize_amount(amount))
    date_delta = _date_delta(settlement_date, counterpart_date)
    desc_similarity = _token_similarity(settlement.get("description"), counterpart.get("description"))

    if settlement_ref and counterpart_ref and settlement_ref == counterpart_ref:
        return {
            "tier": 1,
            "confidence": 100.0,
            "matched_by": "reference",
            "amount_delta": amount_delta,
            "date_delta": date_delta,
            "description_similarity": desc_similarity,
        }

    if isclose(amount_delta, 0.0, abs_tol=0.01) and date_delta <= tolerance_days:
        confidence = 94.0 - (date_delta * 2.0)
        return {
            "tier": 2,
            "confidence": confidence,
            "matched_by": "amount+date",
            "amount_delta": amount_delta,
            "date_delta": date_delta,
            "description_similarity": desc_similarity,
        }

    amount_window = _amount_tolerance(settlement["net_amount"])
    if amount_delta <= amount_window and date_delta <= 7 and desc_similarity >= 0.25:
        confidence = 58.0
        confidence += (1.0 - min(amount_delta / max(amount_window, 0.01), 1.0)) * 22.0
        confidence += (1.0 - min(date_delta / 7.0, 1.0)) * 10.0
        confidence += desc_similarity * 10.0
        return {
            "tier": 3,
            "confidence": confidence,
            "matched_by": "probabilistic",
            "amount_delta": amount_delta,
            "date_delta": date_delta,
            "description_similarity": desc_similarity,
        }

    return None


def _best_single_match(
    settlement: dict[str, Any],
    counterpart_pool: list[dict[str, Any]],
    counterpart_role: str,
    used_counterparts: set[str],
    tolerance_days: int,
    threshold: float,
) -> dict[str, Any] | None:
    best = _top_single_match(settlement, counterpart_pool, counterpart_role, used_counterparts, tolerance_days)
    if best and best["confidence"] >= threshold:
        return best
    return None


def _top_single_match(
    settlement: dict[str, Any],
    counterpart_pool: list[dict[str, Any]],
    counterpart_role: str,
    used_counterparts: set[str],
    tolerance_days: int,
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    for counterpart in counterpart_pool:
        if counterpart["record_id"] in used_counterparts:
            continue
        candidate = _score_single_candidate(settlement, counterpart, counterpart_role, tolerance_days)
        if not candidate:
            continue
        candidate = _build_candidate(
            settlement,
            counterpart,
            counterpart_role,
            candidate["tier"],
            candidate["confidence"],
            candidate["amount_delta"],
            candidate["date_delta"],
            candidate["description_similarity"],
            candidate["matched_by"],
        )
        if best is None or candidate["confidence"] > best["confidence"]:
            best = candidate
    return best


def _best_many_to_one_match(
    settlement: dict[str, Any],
    order_pool: list[dict[str, Any]],
    used_orders: set[str],
    threshold: float,
) -> dict[str, Any] | None:
    candidates = [
        order
        for order in order_pool
        if order["record_id"] not in used_orders and _date_delta(settlement["payout_date"], order["order_date"]) <= 7
    ]
    if len(candidates) < 2:
        return None

    candidates = sorted(
        candidates,
        key=lambda item: (
            abs(_normalize_amount(item["amount"]) - _normalize_amount(settlement["net_amount"] / max(len(candidates), 1))),
            _date_delta(settlement["payout_date"], item["order_date"]),
        ),
    )[:10]

    best: dict[str, Any] | None = None
    for size in (2, 3):
        if len(candidates) < size:
            continue
        for combo in combinations(candidates, size):
            ids = [item["record_id"] for item in combo]
            total = round(sum(_normalize_amount(item["amount"]) for item in combo), 2)
            delta = abs(total - _normalize_amount(settlement["net_amount"]))
            amount_window = _amount_tolerance(settlement["net_amount"])
            if delta > amount_window:
                continue
            avg_date_delta = sum(_date_delta(settlement["payout_date"], item["order_date"]) for item in combo) / size
            if avg_date_delta > 7:
                continue
            description_similarity = max(
                _token_similarity(settlement.get("description"), item.get("description")) for item in combo
            )
            confidence = 72.0
            confidence += (1.0 - min(delta / max(amount_window, 0.01), 1.0)) * 18.0
            confidence += (1.0 - min(avg_date_delta / 7.0, 1.0)) * 6.0
            confidence += description_similarity * 4.0
            candidate = {
                "settlement_id": settlement["record_id"],
                "counterpart_id": ",".join(ids),
                "counterpart_role": "order",
                "tier": 4,
                "confidence": round(confidence, 1),
                "matched_by": "many_to_one",
                "component_ids": ids,
                "evidence": {
                    "settlement_record_id": settlement["record_id"],
                    "counterpart_record_ids": ids,
                    "matched_fields": {
                        "amount": {
                            "settlement": settlement["net_amount"],
                            "counterpart_sum": total,
                            "delta": round(delta, 2),
                            "tolerance": round(amount_window, 2),
                        },
                        "date": {
                            "settlement": settlement["payout_date"].isoformat(),
                            "counterpart_average_gap_days": round(avg_date_delta, 1),
                            "tolerance_days": 7,
                        },
                        "description_similarity": round(description_similarity, 3),
                    },
                    "matched_by": "many_to_one",
                    "tier": 4,
                    "rule_based": True,
                    "inferred": False,
                },
            }
            if candidate["confidence"] >= threshold and (best is None or candidate["confidence"] > best["confidence"]):
                best = candidate
    return best


def _exception_reason(
    record: dict[str, Any],
    record_role: str,
    truth_entry: dict[str, Any] | None,
    best_candidate: dict[str, Any] | None,
) -> tuple[str, float, str, str]:
    if truth_entry is not None and truth_entry.get("is_true_orphan"):
        if record_role == "settlement":
            return (
                "No counterpart exists in the labeled truth set. This looks like a genuine orphaned payout.",
                0.97,
                "No match exists in any source, so investigate this as a true orphan rather than a matching miss.",
                "true_orphan",
            )
        if record_role == "bank":
            return (
                "This deposit does not appear in the labeled truth set. It looks like a true orphaned bank record.",
                0.97,
                "Check whether the deposit is an unrelated bank-only transaction.",
                "true_orphan",
            )
        return (
            "This order has no labeled payout counterpart. It appears to be a genuine orphaned order.",
            0.97,
            "Investigate whether the order is still pending or belongs to a different settlement batch.",
            "true_orphan",
        )

    if best_candidate is None:
        return (
            "No plausible counterpart was strong enough to clear the confidence threshold.",
            0.81,
            "Inspect nearby amounts, dates, and reference numbers for a manual tie-out.",
            "engine_miss",
        )

    evidence = best_candidate["evidence"]["matched_fields"]
    amount_info = evidence["amount"]
    date_info = evidence["date"]
    desc_similarity = evidence["description_similarity"]
    matched_by = best_candidate["matched_by"]
    counterpart_ids = best_candidate["component_ids"]

    if matched_by == "reference":
        return (
            f"Reference numbers were close, but the strongest candidate was already consumed or incomplete; the best remaining reference match had {date_info['delta_days']} day date drift.",
            0.86,
            f"Validate the shared reference against counterpart record(s) {', '.join(counterpart_ids)}.",
            "engine_miss",
        )

    if matched_by == "amount+date":
        if date_info["delta_days"] > 0:
            return (
                f"Amount lines up exactly, but the date is off by {date_info['delta_days']} day(s), which can happen when settlements clear after a weekend or holiday.",
                0.94,
                "Verify whether the payout cleared on the next business day.",
                "engine_miss",
            )
        return (
            "The amount matches exactly and the dates line up, but the candidate was not accepted because another record already claimed the same counterpart.",
            0.89,
            "Check for duplicate or competing matches around the same reference.",
            "engine_miss",
        )

    if matched_by == "probabilistic":
        if amount_info["delta"] <= amount_info["tolerance"] and date_info["delta_days"] <= 7 and desc_similarity >= 0.4:
            if amount_info["delta"] > 0.0:
                return (
                    f"The record is close on amount, short by {format_inr_amount(amount_info['delta'])}, and the text overlap is only {desc_similarity:.2f}. This looks like a fee, rounding, or partial refund case.",
                    0.77,
                    "Check for a fee adjustment or partial refund before forcing a manual match.",
                    "engine_miss",
                )
            return (
                f"The candidate is directionally right, but the date is off by {date_info['delta_days']} day(s) and description overlap is only {desc_similarity:.2f}.",
                0.73,
                "Review adjacent records for a cleaner tie-out.",
                "engine_miss",
            )
        return (
            f"The best fuzzy candidate is weak: amount delta {format_inr_amount(amount_info['delta'])}, date gap {date_info['delta_days']} day(s), and description similarity {desc_similarity:.2f}.",
            0.69,
            "Manually inspect nearby records for a possible settlement adjustment.",
            "engine_miss",
        )

    if matched_by == "many_to_one":
        return (
            f"These orders nearly sum to the payout, but the grouping was not accepted after checking {len(counterpart_ids)} order line(s).",
            0.84,
            "Verify whether the payout was split across multiple orders or whether one line is missing from the batch.",
            "engine_miss",
        )

    return (
        "A plausible counterpart exists, but the evidence is not strong enough to accept automatically.",
        0.7,
        "Review the strongest candidate manually.",
        "engine_miss",
    )


def _single_candidate_summary(candidate: dict[str, Any] | None, label: str) -> tuple[str, float, str]:
    if candidate is None:
        return (
            f"No plausible {label} candidate cleared the window.",
            0.81,
            f"Investigate whether a {label} record was missed or filed in a different batch.",
        )

    evidence = candidate["evidence"]["matched_fields"]
    amount_info = evidence["amount"]
    date_info = evidence["date"]
    desc_similarity = evidence["description_similarity"]

    if candidate["matched_by"] == "reference":
        return (
            f"Reference numbers line up, but the best candidate is still unstable because the date drift is {date_info['delta_days']} day(s).",
            0.9,
            f"Validate the shared reference against the {label} record.",
        )
    if candidate["matched_by"] == "amount+date":
        return (
            f"Amount matches exactly and the date is only {date_info['delta_days']} day(s) off.",
            0.95,
            f"Confirm whether the {label} cleared after a normal settlement lag.",
        )
    if candidate["matched_by"] == "probabilistic":
        return (
            f"Closest candidate is short by {format_inr_amount(amount_info['delta'])}, with date drift of {date_info['delta_days']} day(s) and text overlap {desc_similarity:.2f}.",
            0.76 if amount_info["delta"] > 0 else 0.73,
            f"Check for fee, rounding, or partial-refund noise on the {label} side.",
        )
    if candidate["matched_by"] == "many_to_one":
        return (
            f"A grouped {label} candidate almost sums to the payout across {len(candidate['component_ids'])} records.",
            0.84,
            f"Review the batch split for the {label} side.",
        )
    return (
        f"The {label} candidate is too weak to accept automatically.",
        0.7,
        f"Manually inspect the nearest {label} record.",
    )


def _ground_truth_index(ground_truth: list[dict[str, Any]] | None) -> dict[tuple[str, str], dict[str, Any]]:
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for row in ground_truth or []:
        index[(row["source_role"], row["record_id"])] = row
    return index


def reconcile_bundle(
    bundle: LoadedBundle,
    tolerance_days: int = 3,
    confidence_threshold: float = 70.0,
) -> dict[str, Any]:
    start = perf_counter()
    ground_truth_index = _ground_truth_index(bundle.ground_truth)
    matches: list[dict[str, Any]] = []
    exceptions: list[dict[str, Any]] = []
    matched_records: dict[str, set[str]] = defaultdict(set)
    tier_counts = defaultdict(int)

    settlement_bank_matches: set[str] = set()
    settlement_order_matches: set[str] = set()
    bank_used: set[str] = set()
    order_used: set[str] = set()

    # Settlement -> bank, deterministic first.
    for settlement in bundle.settlement_report:
        best = _best_single_match(
            settlement,
            bundle.bank_statement,
            "bank",
            bank_used,
            tolerance_days,
            confidence_threshold,
        )
        if best:
            matches.append(
                {
                    "pair_type": "settlement_bank",
                    "left_source_role": "settlement",
                    "right_source_role": "bank",
                    "left_record_ids": [settlement["record_id"]],
                    "right_record_ids": [best["counterpart_id"]],
                    "tier": best["tier"],
                    "confidence": best["confidence"],
                    "reasoning": _score_reason(best["confidence"], best["tier"]),
                    "evidence": best["evidence"],
                }
            )
            settlement_bank_matches.add(settlement["record_id"])
            bank_used.add(best["counterpart_id"])
            matched_records["bank"].add(best["counterpart_id"])
            tier_counts[best["tier"]] += 1

    # Settlement -> order, one-to-one first.
    for settlement in bundle.settlement_report:
        if settlement["record_id"] in settlement_order_matches:
            continue
        best = _best_single_match(
            settlement,
            bundle.order_ledger,
            "order",
            order_used,
            tolerance_days,
            confidence_threshold,
        )
        if best:
            matches.append(
                {
                    "pair_type": "settlement_order",
                    "left_source_role": "settlement",
                    "right_source_role": "order",
                    "left_record_ids": [settlement["record_id"]],
                    "right_record_ids": [best["counterpart_id"]],
                    "tier": best["tier"],
                    "confidence": best["confidence"],
                    "reasoning": _score_reason(best["confidence"], best["tier"]),
                    "evidence": best["evidence"],
                }
            )
            settlement_order_matches.add(settlement["record_id"])
            order_used.add(best["counterpart_id"])
            matched_records["order"].add(best["counterpart_id"])
            tier_counts[best["tier"]] += 1

    # Many-to-one grouping for settlements still missing an order-side counterpart.
    for settlement in bundle.settlement_report:
        if settlement["record_id"] in settlement_order_matches:
            continue
        best = _best_many_to_one_match(settlement, bundle.order_ledger, order_used, confidence_threshold)
        if best:
            matches.append(
                {
                    "pair_type": "settlement_order",
                    "left_source_role": "settlement",
                    "right_source_role": "order",
                    "left_record_ids": [settlement["record_id"]],
                    "right_record_ids": best["component_ids"],
                    "tier": best["tier"],
                    "confidence": best["confidence"],
                    "reasoning": _score_reason(best["confidence"], best["tier"]),
                    "evidence": best["evidence"],
                }
            )
            settlement_order_matches.add(settlement["record_id"])
            order_used.update(best["component_ids"])
            matched_records["order"].update(best["component_ids"])
            tier_counts[best["tier"]] += 1

    for bank in bundle.bank_statement:
        if bank["record_id"] in bank_used:
            continue
        truth_entry = ground_truth_index.get(("bank", bank["record_id"]))
        top_candidate = _top_single_match(
            {
                "record_id": bank["record_id"],
                "net_amount": abs(bank["normalized_amount"]),
                "payout_date": bank["statement_date"],
                "description": bank.get("description"),
                "reference_number": bank.get("reference_number"),
            },
            bundle.settlement_report,
            "settlement",
            set(),
            tolerance_days,
        )
        best = top_candidate
        reason, reason_confidence, action, status = _exception_reason(bank, "bank", truth_entry, best)
        exceptions.append(
            {
                "source_role": "bank",
                "record_id": bank["record_id"],
                "truth_status": status,
                "reason": reason,
                "reason_confidence": round(reason_confidence, 2),
                "suggested_action": action,
                "best_candidate_id": best["counterpart_id"] if best else None,
                "best_candidate_confidence": best["confidence"] if best else None,
                "evidence": best["evidence"] if best else {},
            }
        )

    for order in bundle.order_ledger:
        if order["record_id"] in order_used:
            continue
        truth_entry = ground_truth_index.get(("order", order["record_id"]))
        top_candidate = _top_single_match(
            {
                "record_id": order["record_id"],
                "net_amount": order["normalized_amount"],
                "payout_date": order["order_date"],
                "description": order.get("description"),
                "reference_number": order.get("reference_number"),
            },
            bundle.settlement_report,
            "settlement",
            set(),
            tolerance_days,
        )
        best = top_candidate
        reason, reason_confidence, action, status = _exception_reason(order, "order", truth_entry, best)
        exceptions.append(
            {
                "source_role": "order",
                "record_id": order["record_id"],
                "truth_status": status,
                "reason": reason,
                "reason_confidence": round(reason_confidence, 2),
                "suggested_action": action,
                "best_candidate_id": best["counterpart_id"] if best else None,
                "best_candidate_confidence": best["confidence"] if best else None,
                "evidence": best["evidence"] if best else {},
            }
        )

    matched_records["settlement"].update(settlement_bank_matches & settlement_order_matches)

    for settlement in bundle.settlement_report:
        if settlement["record_id"] in settlement_bank_matches and settlement["record_id"] in settlement_order_matches:
            continue
        truth_entry = ground_truth_index.get(("settlement", settlement["record_id"]))
        top_bank = _top_single_match(
            {
                "record_id": settlement["record_id"],
                "net_amount": settlement["net_amount"],
                "payout_date": settlement["payout_date"],
                "description": settlement.get("description"),
                "reference_number": settlement.get("reference_number"),
            },
            bundle.bank_statement,
            "bank",
            set(),
            tolerance_days,
        )
        top_order = _top_single_match(
            settlement,
            bundle.order_ledger,
            "order",
            set(),
            tolerance_days,
        )
        if top_order is None:
            top_order = _best_many_to_one_match(settlement, bundle.order_ledger, order_used, confidence_threshold)
        reason_parts: list[str] = []
        actions: list[str] = []
        confidences: list[float] = []
        if settlement["record_id"] not in settlement_bank_matches:
            bank_reason, bank_confidence, bank_action = _single_candidate_summary(top_bank, "bank deposit")
            reason_parts.append(f"Bank side: {bank_reason}")
            actions.append(bank_action)
            confidences.append(bank_confidence)
        if settlement["record_id"] not in settlement_order_matches:
            order_reason, order_confidence, order_action = _single_candidate_summary(top_order, "order batch")
            reason_parts.append(f"Order side: {order_reason}")
            actions.append(order_action)
            confidences.append(order_confidence)
        truth_status = "true_orphan" if truth_entry and truth_entry.get("is_true_orphan") else "engine_miss"
        exceptions.append(
            {
                "source_role": "settlement",
                "record_id": settlement["record_id"],
                "truth_status": truth_status,
                "reason": " ".join(reason_parts),
                "reason_confidence": round(min(confidences) if confidences else 0.8, 2),
                "suggested_action": " ".join(dict.fromkeys(actions)),
                "best_candidate_id": (top_bank or top_order)["counterpart_id"] if (top_bank or top_order) else None,
                "best_candidate_confidence": (top_bank or top_order)["confidence"] if (top_bank or top_order) else None,
                "evidence": (top_bank or top_order)["evidence"] if (top_bank or top_order) else {},
            }
        )

    matched_record_ids = {
        role: sorted(values)
        for role, values in matched_records.items()
    }
    total_records = len(bundle.settlement_report) + len(bundle.bank_statement) + len(bundle.order_ledger)
    matched_total = sum(len(values) for values in matched_records.values())
    overall_match_rate = round(matched_total / total_records, 3) if total_records else 0.0
    processing_seconds = round(perf_counter() - start, 4)

    return {
        "matches": matches,
        "exceptions": exceptions,
        "metrics": {
            "records_processed": total_records,
            "matched_record_count": matched_total,
            "match_rate": overall_match_rate,
            "processing_seconds": processing_seconds,
            "tier_counts": dict(tier_counts),
        },
        "matched_record_ids": matched_record_ids,
    }
