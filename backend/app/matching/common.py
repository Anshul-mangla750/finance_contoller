from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass
class MatchCandidate:
    left_type: str
    left_id: str
    right_type: str
    right_id: str
    score: float
    confidence: float
    reasoning: str
    layer: int
    kind: str
    left_amount: float
    right_amount: float
    left_date: date
    right_date: date
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExceptionItem:
    source_type: str
    record_id: str
    best_candidate_type: str | None
    best_candidate_id: str | None
    best_candidate_confidence: float | None
    reason_category: str
    explanation: str
    suggested_action: str


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(value).date()


def amount_delta(left: float, right: float) -> float:
    return round(abs(abs(left) - abs(right)), 2)


def amount_tolerance(amount: float) -> float:
    return round(max(5.0, abs(amount) * 0.02), 2)


def date_distance(left: date, right: date) -> int:
    return abs((left - right).days)


def bucket_confidence(confidence: float) -> str:
    if confidence >= 0.95:
        return "0.95-1.0"
    if confidence >= 0.85:
        return "0.85-0.95"
    if confidence >= 0.75:
        return "0.75-0.85"
    if confidence >= 0.6:
        return "0.60-0.75"
    return "below_0.60"


