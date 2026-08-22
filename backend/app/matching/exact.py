from __future__ import annotations

from typing import Iterable

from rapidfuzz import fuzz

from app.matching.common import MatchCandidate, amount_delta, date_distance, parse_date


def exact_match_records(
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
    left_link_field: str | None = None,
    right_link_field: str | None = None,
) -> list[MatchCandidate]:
    right_lookup = {record[right_id_field]: record for record in right_records}
    right_link_lookup: dict[str, dict] = {}
    if right_link_field:
        for record in right_records:
            linked_value = record.get(right_link_field)
            if linked_value:
                right_link_lookup[str(linked_value)] = record
    used_right: set[str] = set()
    matches: list[MatchCandidate] = []

    for left in left_records:
        left_id = left[left_id_field]
        left_amount = float(left[left_amount_field])
        left_date = parse_date(left[left_date_field])
        explicit_target = left.get(left_link_field) if left_link_field else None
        if explicit_target and explicit_target in right_lookup and explicit_target not in used_right:
            right = right_lookup[explicit_target]
            right_amount = float(right[right_amount_field])
            right_date = parse_date(right[right_date_field])
            matches.append(
                MatchCandidate(
                    left_type=left_source_type,
                    left_id=left_id,
                    right_type=right_source_type,
                    right_id=explicit_target,
                    score=1.0,
                    confidence=1.0,
                    reasoning="Linked identifier provided by source record.",
                    layer=1,
                    kind="exact_linked",
                    left_amount=left_amount,
                    right_amount=right_amount,
                    left_date=left_date,
                    right_date=right_date,
                )
            )
            used_right.add(explicit_target)
            continue

        if left_id in right_link_lookup:
            right = right_link_lookup[left_id]
            right_id = right[right_id_field]
            if right_id not in used_right:
                right_amount = float(right[right_amount_field])
                right_date = parse_date(right[right_date_field])
                matches.append(
                    MatchCandidate(
                        left_type=left_source_type,
                        left_id=left_id,
                        right_type=right_source_type,
                        right_id=right_id,
                        score=1.0,
                        confidence=1.0,
                        reasoning="Explicit counterpart reference found on the opposite side.",
                        layer=1,
                        kind="exact_linked",
                        left_amount=left_amount,
                        right_amount=right_amount,
                        left_date=left_date,
                        right_date=right_date,
                    )
                )
                used_right.add(right_id)
                continue

        best = None
        for right in right_records:
            right_id = right[right_id_field]
            if right_id in used_right:
                continue
            right_amount = float(right[right_amount_field])
            right_date = parse_date(right[right_date_field])
            if amount_delta(left_amount, right_amount) == 0 and date_distance(left_date, right_date) <= 2:
                score = 1.0
                if left.get("description") and right.get("memo"):
                    score += fuzz.token_ratio(left["description"], right["memo"]) / 1000.0
                candidate = MatchCandidate(
                    left_type=left_source_type,
                    left_id=left_id,
                    right_type=right_source_type,
                    right_id=right_id,
                    score=score,
                    confidence=1.0,
                    reasoning=f"Exact amount and date window matched ({date_distance(left_date, right_date)} day delta).",
                    layer=1,
                    kind="exact",
                    left_amount=left_amount,
                    right_amount=right_amount,
                    left_date=left_date,
                    right_date=right_date,
                )
                if best is None or candidate.score > best.score:
                    best = candidate
        if best:
            used_right.add(best.right_id)
            matches.append(best)
    return matches
