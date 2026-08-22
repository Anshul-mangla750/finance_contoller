from __future__ import annotations

import hashlib
import json
import math
from typing import Any, TypeVar

from pydantic import BaseModel

from app.config import get_settings
from app.llm.prompts import build_exception_explanation_prompt, build_match_batch_prompt, build_qa_prompt
from app.llm.schemas import ExceptionExplanation, GroundedExplanation, LLMMatchBatchDecision, LLMMatchDecision, QAResponse

T = TypeVar("T", bound=BaseModel)


class GeminiClient:
    def __init__(self, api_key: str | None = None):
        self.settings = get_settings()
        self.api_key = api_key or self.settings.gemini_api_key
        self._client = None
        if self.api_key:
            try:
                from google import genai

                self._client = genai.Client(api_key=self.api_key)
            except Exception:
                self._client = None

    def structured_call(self, prompt_name: str, schema_model: type[T], payload: dict[str, Any], model: str | None = None) -> T:
        prompt = self._build_prompt(prompt_name, payload)
        model_name = model or self.settings.llm_model
        if self._client is not None:
            try:
                from google.genai import types

                response = self._client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema_model,
                    ),
                )
                return schema_model.model_validate_json(response.text)
            except Exception:
                pass
        return self._offline_response(prompt_name, schema_model, payload)

    def embed_texts(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        if self._client is not None:
            try:
                from google.genai import types

                response = self._client.models.embed_content(
                    model=model or self.settings.embedding_model,
                    contents=texts,
                    config=types.EmbedContentConfig(output_dimensionality=256),
                )
                vectors = []
                for embedding in response.embeddings:
                    vectors.append(list(embedding.values))
                if vectors:
                    return vectors
            except Exception:
                pass
        return [self._offline_embedding(text) for text in texts]

    def _build_prompt(self, prompt_name: str, payload: dict[str, Any]) -> str:
        if prompt_name == "llm_match_batch":
            return build_match_batch_prompt(payload)
        if prompt_name == "exception_explanation":
            return build_exception_explanation_prompt(payload)
        if prompt_name == "qa_response":
            return build_qa_prompt(payload)
        return json.dumps(payload, indent=2, sort_keys=True)

    def _offline_response(self, prompt_name: str, schema_model: type[T], payload: dict[str, Any]) -> T:
        if schema_model is LLMMatchBatchDecision:
            decisions = []
            threshold = float(payload.get("confidence_threshold", self.settings.llm_confidence_threshold))
            for record in payload.get("unresolved_records", []):
                best = self._best_candidate(record, payload.get("candidate_pool", []))
                if best is None or best["confidence"] < threshold:
                    decisions.append(
                        LLMMatchDecision(
                            record_id=record["record_id"],
                            proposed_match_id=None,
                            confidence=round(best["confidence"] if best else 0.25, 3),
                            reasoning=best["reasoning"] if best else "No sufficiently close candidate.",
                            category="ambiguous",
                        )
                    )
                else:
                    decisions.append(
                        LLMMatchDecision(
                            record_id=record["record_id"],
                            proposed_match_id=best["candidate_id"],
                            confidence=round(best["confidence"], 3),
                            reasoning=best["reasoning"],
                            category="match_found" if best["confidence"] >= threshold else "ambiguous",
                        )
                    )
            return LLMMatchBatchDecision(decisions=decisions)  # type: ignore[return-value]
        if schema_model is ExceptionExplanation:
            record = payload["record"]
            reason_category = payload["reason_category"]
            explanation_map = {
                "missing_counterpart": "No confirmed counterpart exists in the current batch.",
                "amount_mismatch": "The amount is outside the tolerance window for a safe auto-match.",
                "date_out_of_tolerance": "The date difference is too large relative to the reconciliation rules.",
                "duplicate_suspected": "A similar record already matched, so this looks like a duplicate entry.",
                "unresolved_ambiguous": "There are multiple plausible candidates and no single confident answer.",
                "low_confidence_llm": "The model response did not reach the configured confidence threshold.",
            }
            suggested_map = {
                "missing_counterpart": "Request supporting documentation or confirm the missing posting.",
                "amount_mismatch": "Check for fees, FX differences, or manual adjustments.",
                "date_out_of_tolerance": "Review posting dates and settlement timing.",
                "duplicate_suspected": "Confirm whether the ledger entry is a duplicate journal line.",
                "unresolved_ambiguous": "Review manually and compare against source documents.",
                "low_confidence_llm": "Escalate for human review.",
            }
            return ExceptionExplanation(
                record_id=record["record_id"],
                reason_category=reason_category,
                explanation=explanation_map.get(reason_category, "No deterministic explanation available."),
                suggested_action=suggested_map.get(reason_category, "Review manually."),
            )  # type: ignore[return-value]
        if schema_model is QAResponse:
            context = payload.get("context", [])
            question = payload.get("question", "").lower()
            cited = [chunk["record_id"] for chunk in context[:4]]
            if not context or any(term in question for term in ["weather", "sports", "stock", "movie"]):
                return QAResponse(
                    answer="I don't have enough matched data to answer that confidently.",
                    cited_record_ids=[],
                    confidence="low",
                )  # type: ignore[return-value]
            answer = context[0].get("text", "I found relevant reconciliation records.")
            return QAResponse(answer=answer[:500], cited_record_ids=cited, confidence="medium")  # type: ignore[return-value]
        if schema_model is GroundedExplanation:
            ev = payload.get("evidence", {})
            status = payload.get("status", "UNKNOWN")
            record_id = payload.get("record_id", "")
            diff = ev.get("amountDifference", 0)
            date_diff = ev.get("dateDifference", 0)

            if diff > 0:
                summary = f"Record {record_id} has an amount variance of ₹{diff:,.2f}."
                causes = ["Fee deduction by payment gateway", "Tax/GST withholding difference", "Partial payment settlement"]
                action = "Check for matching fee journal entries or partial settlement posting."
                certainty = "likely_explanation"
            elif date_diff > 5:
                summary = f"Record {record_id} posted with a date delay of {date_diff} days."
                causes = ["Weekend/bank holiday cutoff delay", "Delayed batch file posting"]
                action = "Verify settlement cutoff timestamp with banking partner."
                certainty = "likely_explanation"
            else:
                summary = f"Record {record_id} missing matching counterpart in target ledger."
                causes = ["Unposted transaction in GL", "Timing difference across period end"]
                action = "Request counterparty bank statement or verify journal posting."
                certainty = "unknown"

            return GroundedExplanation(
                explanation=summary,
                confidence=0.85 if diff > 0 or date_diff > 0 else 0.6,
                evidence_summary=f"Amount diff: ₹{diff}, Date gap: {date_diff}d, Status: {status}",
                possible_causes=causes,
                recommended_action=action,
                certainty=certainty,
            )  # type: ignore[return-value]
        return schema_model.model_validate({})  # type: ignore[arg-type]

    def _best_candidate(self, record: dict[str, Any], candidate_pool: list[dict[str, Any]]) -> dict[str, Any] | None:
        best: dict[str, Any] | None = None
        for candidate in candidate_pool:
            if candidate["source_type"] != record["source_type"]:
                continue
            score = 0.0
            amount_delta = abs(abs(float(record["amount"])) - abs(float(candidate["amount"])))
            score += max(0.0, 1.0 - amount_delta / max(abs(float(record["amount"])), 1.0)) * 0.5
            record_date = record.get("date")
            candidate_date = candidate.get("date")
            date_gap = 0
            if record_date and candidate_date:
                try:
                    from datetime import date as _date

                    date_gap = abs((_date.fromisoformat(record_date) - _date.fromisoformat(candidate_date)).days)
                except Exception:
                    date_gap = abs(int(record.get("date_gap_days", 0)) - int(candidate.get("date_gap_days", 0)))
            else:
                date_gap = abs(int(record.get("date_gap_days", 0)) - int(candidate.get("date_gap_days", 0)))
            score += max(0.0, 1.0 - date_gap / 5.0) * 0.2
            if record.get("text") and candidate.get("text"):
                score += self._text_similarity(record["text"], candidate["text"]) * 0.3
            reasoning = (
                f"Amount delta {amount_delta:.2f}, date gap difference {date_gap} days, "
                f"text similarity {self._text_similarity(record.get('text', ''), candidate.get('text', '')):.2f}."
            )
            if best is None or score > best["confidence"]:
                best = {
                    "candidate_id": candidate["record_id"],
                    "confidence": min(1.0, score),
                    "reasoning": reasoning,
                }
        return best

    def _offline_embedding(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = []
        for index in range(0, 32, 4):
            chunk = digest[index : index + 4]
            values.append(int.from_bytes(chunk, "big") / 2**32)
        norm = math.sqrt(sum(value * value for value in values)) or 1.0
        return [round(value / norm, 6) for value in values]

    def _text_similarity(self, left: str, right: str) -> float:
        if not left or not right:
            return 0.0
        left_tokens = set(left.lower().split())
        right_tokens = set(right.lower().split())
        if not left_tokens or not right_tokens:
            return 0.0
        return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
