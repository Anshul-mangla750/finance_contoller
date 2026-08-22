from __future__ import annotations

from typing import Iterable

from rapidfuzz import fuzz

from app.matching.common import MatchCandidate, amount_delta, amount_tolerance, date_distance, parse_date


def fuzzy_match_records(
    left_records: Iterable[dict],
    right_records: Iterable[dict],
    left_source_type: str,
    right_source_type: str,
    left_id_field: str,
    right_id_field: str,
    left_date_field: str,
    right_date_field: str,
    left_amount_field: str = "amount",
    right_amount_field: str = "amount",
    left_text_field: str = "description",
    right_text_field: str = "memo",
    excluded_right_ids: set[str] | None = None,
) -> list[MatchCandidate]:
    used_right = set(excluded_right_ids or set())
    matches: list[MatchCandidate] = []

    for left in left_records:
        left_id = left[left_id_field]
        left_amount = float(left[left_amount_field])
        left_date = parse_date(left[left_date_field])
        best_candidate: MatchCandidate | None = None

        for right in right_records:
            right_id = right[right_id_field]
            if right_id in used_right:
                continue
            right_amount = float(right[right_amount_field])
            right_date = parse_date(right[right_date_field])
            delta = amount_delta(left_amount, right_amount)
            if delta > amount_tolerance(left_amount):
                continue
            day_gap = date_distance(left_date, right_date)
            if day_gap > 5:
                continue
            text_score = 0.0
            if left_text_field in left and right_text_field in right:
                text_score = fuzz.token_ratio(str(left[left_text_field]), str(right[right_text_field])) / 100.0
            amount_score = 1.0 - min(delta / max(amount_tolerance(left_amount), 0.01), 1.0)
            date_score = 1.0 - (day_gap / 5.0)
            score = (amount_score * 0.45) + (date_score * 0.2) + (text_score * 0.35)
            confidence = round(0.6 + score * 0.35, 3)
            reasoning = (
                f"Amount delta {delta:.2f} within tolerance {amount_tolerance(left_amount):.2f}, "
                f"date gap {day_gap} days, token similarity {text_score:.2f}."
            )
            candidate = MatchCandidate(
                left_type=left_source_type,
                left_id=left_id,
                right_type=right_source_type,
                right_id=right_id,
                score=score,
                confidence=confidence,
                reasoning=reasoning,
                layer=2,
                kind="fuzzy",
                left_amount=left_amount,
                right_amount=right_amount,
                left_date=left_date,
                right_date=right_date,
            )
            if best_candidate is None or candidate.confidence > best_candidate.confidence:
                best_candidate = candidate
        if best_candidate and best_candidate.confidence >= 0.6:
            used_right.add(best_candidate.right_id)
            matches.append(best_candidate)
    return matches
