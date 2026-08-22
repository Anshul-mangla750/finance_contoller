from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LLMMatchDecision(BaseModel):
    record_id: str
    proposed_match_id: str | None
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    category: Literal["match_found", "no_match_confident", "ambiguous"]


class LLMMatchBatchDecision(BaseModel):
    decisions: list[LLMMatchDecision]


class ExceptionExplanation(BaseModel):
    record_id: str
    reason_category: Literal[
        "missing_counterpart",
        "amount_mismatch",
        "date_out_of_tolerance",
        "duplicate_suspected",
        "unresolved_ambiguous",
        "low_confidence_llm",
    ]
    explanation: str
    suggested_action: str


class QAResponse(BaseModel):
    answer: str
    cited_record_ids: list[str]
    confidence: Literal["high", "medium", "low"]


class GroundedExplanation(BaseModel):
    explanation: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_summary: str
    possible_causes: list[str]
    recommended_action: str
    certainty: Literal["confirmed_fact", "likely_explanation", "unknown"]


