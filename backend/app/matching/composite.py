from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from typing import Iterable

from app.matching.common import MatchCandidate, amount_delta, amount_tolerance, date_distance, parse_date


def composite_match_records(
    bank_records: Iterable[dict],
    target_records: Iterable[dict],
    left_source_type: str = "bank",
    right_source_type: str = "ledger",
    bank_id_field: str = "txn_id",
    target_id_field: str = "entry_id",
    bank_date_field: str = "date",
    target_date_field: str = "date",
    target_amount_field: str = "amount",
    excluded_bank_ids: set[str] | None = None,
    excluded_target_ids: set[str] | None = None,
) -> list[MatchCandidate]:
    used_bank = set(excluded_bank_ids or set())
    used_target = set(excluded_target_ids or set())
    matches: list[MatchCandidate] = []

    banks = [record for record in bank_records if record[bank_id_field] not in used_bank]
    targets = [record for record in target_records if record[target_id_field] not in used_target]

    for target in targets:
        target_amount = float(target[target_amount_field])
        target_date = parse_date(target[target_date_field])
        candidate_banks = [
            bank
            for bank in banks
            if bank[bank_id_field] not in used_bank
            and date_distance(parse_date(bank[bank_date_field]), target_date) <= 5
        ]
        if len(candidate_banks) < 2:
            continue

        for bank_count in range(2, min(3, len(candidate_banks)) + 1):
            for combo in combinations(candidate_banks, bank_count):
                total = round(sum(abs(float(item["amount"])) for item in combo), 2)
                delta = amount_delta(total, target_amount)
                if delta > amount_tolerance(target_amount):
                    continue
                avg_gap = sum(date_distance(parse_date(item[bank_date_field]), target_date) for item in combo) / bank_count
                confidence = round(0.7 + max(0.0, 0.2 - (delta / max(amount_tolerance(target_amount), 0.01)) * 0.15), 3)
                confidence = min(confidence, 0.9)
                reasoning = (
                    f"Composite split payment across {bank_count} bank transactions totals {total:.2f} "
                    f"against target {target_amount:.2f} with delta {delta:.2f}; average date gap {avg_gap:.1f} days."
                )
                matches.append(
                    MatchCandidate(
                        left_type=left_source_type,
                        left_id=",".join(bank[bank_id_field] for bank in combo),
                        right_type=right_source_type,
                        right_id=target[target_id_field],
                        score=1.0 - (delta / max(amount_tolerance(target_amount), 0.01)),
                        confidence=confidence,
                        reasoning=reasoning,
                        layer=3,
                        kind="split_payment",
                        left_amount=total,
                        right_amount=target_amount,
                        left_date=min(parse_date(item[bank_date_field]) for item in combo),
                        right_date=target_date,
                        metadata={"bank_ids": [bank[bank_id_field] for bank in combo]},
                    )
                )
                used_bank.update(bank[bank_id_field] for bank in combo)
                used_target.add(target[target_id_field])
                break
            if target[target_id_field] in used_target:
                break
    return matches
