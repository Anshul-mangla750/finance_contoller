from __future__ import annotations

from typing import Iterable, Literal

from app.llm.gemini_client import GeminiClient
from app.llm.schemas import LLMMatchBatchDecision, LLMMatchDecision


class LLMFallbackMatcher:
    def __init__(self, client: GeminiClient, confidence_threshold: float = 0.75):
        self.client = client
        self.confidence_threshold = confidence_threshold

    def match_batch(
        self,
        unresolved_records: list[dict],
        candidate_pool: list[dict],
        source_type: str,
        target_type: str,
    ) -> list[LLMMatchDecision]:
        return self.client.structured_call(
            prompt_name="llm_match_batch",
            schema_model=LLMMatchBatchDecision,
            payload={
                "source_type": source_type,
                "target_type": target_type,
                "unresolved_records": unresolved_records,
                "candidate_pool": candidate_pool,
                "confidence_threshold": self.confidence_threshold,
            },
        ).decisions

    def explain_exception(self, record: dict, reason_category: str, best_candidate: dict | None = None) -> dict:
        return self.client.structured_call(
            prompt_name="exception_explanation",
            schema_model=dict,  # type: ignore[arg-type]
            payload={
                "record": record,
                "reason_category": reason_category,
                "best_candidate": best_candidate,
            },
        )

