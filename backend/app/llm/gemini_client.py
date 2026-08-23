from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime
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

    @property
    def is_online(self) -> bool:
        return self._client is not None

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

    # ─── Offline / fallback intelligence ───────────────────────────────────

    def _offline_response(self, prompt_name: str, schema_model: type[T], payload: dict[str, Any]) -> T:
        if schema_model is LLMMatchBatchDecision:
            return self._offline_match_batch(payload)  # type: ignore[return-value]
        if schema_model is ExceptionExplanation:
            return self._offline_exception_explanation(payload)  # type: ignore[return-value]
        if schema_model is QAResponse:
            return self._offline_qa(payload)  # type: ignore[return-value]
        if schema_model is GroundedExplanation:
            return self._offline_grounded_explanation(payload)  # type: ignore[return-value]
        return schema_model.model_validate({})  # type: ignore[arg-type]

    def _offline_match_batch(self, payload: dict[str, Any]) -> LLMMatchBatchDecision:
        """Smart offline matching: iterate unresolved records, find best candidate, score it."""
        threshold = float(payload.get("confidence_threshold", self.settings.llm_confidence_threshold))
        unresolved = payload.get("unresolved_records", [])
        candidates = payload.get("candidate_pool", [])
        source_type = payload.get("source_type", "")
        target_type = payload.get("target_type", "")

        decisions: list[LLMMatchDecision] = []
        used_candidates: set[str] = set()

        for record in unresolved:
            best = self._smart_best_candidate(record, candidates, source_type, target_type, used_candidates)
            if best is None or best["confidence"] < threshold:
                decisions.append(LLMMatchDecision(
                    record_id=record["record_id"],
                    proposed_match_id=None,
                    confidence=round(best["confidence"] if best else 0.15, 3),
                    reasoning=best["reasoning"] if best else "No sufficiently close candidate found.",
                    category="ambiguous" if best and best["confidence"] >= 0.3 else "no_match_confident",
                ))
            else:
                decisions.append(LLMMatchDecision(
                    record_id=record["record_id"],
                    proposed_match_id=best["candidate_id"],
                    confidence=round(best["confidence"], 3),
                    reasoning=best["reasoning"],
                    category="match_found",
                ))
                used_candidates.add(best["candidate_id"])

        return LLMMatchBatchDecision(decisions=decisions)

    def _smart_best_candidate(
        self,
        record: dict[str, Any],
        candidates: list[dict[str, Any]],
        source_type: str,
        target_type: str,
        used_candidates: set[str],
    ) -> dict[str, Any] | None:
        """Score each candidate with multi-factor analysis."""
        rec_amount = abs(float(record.get("amount", 0)))
        rec_text = str(record.get("text", "")).lower()
        rec_date = self._parse_date(record.get("date"))

        best: dict[str, Any] | None = None
        for cand in candidates:
            if cand.get("source_type") == source_type:
                continue
            if cand.get("record_id") in used_candidates:
                continue

            cand_amount = abs(float(cand.get("amount", 0)))
            cand_text = str(cand.get("text", "")).lower()
            cand_date = self._parse_date(cand.get("date"))

            # Amount scoring
            amount_delta = abs(rec_amount - cand_amount)
            tolerance = max(5.0, rec_amount * 0.02)
            if amount_delta <= tolerance:
                amount_score = 1.0 - (amount_delta / max(tolerance, 0.01)) * 0.3
            elif amount_delta <= tolerance * 3:
                amount_score = 0.4 - (amount_delta / max(tolerance * 3, 0.01)) * 0.3
            else:
                amount_score = 0.0

            # Date scoring
            day_gap = 999
            if rec_date and cand_date:
                day_gap = abs((rec_date - cand_date).days)
            if day_gap <= 2:
                date_score = 1.0
            elif day_gap <= 5:
                date_score = 0.7
            elif day_gap <= 10:
                date_score = 0.3
            else:
                date_score = 0.0

            # Text similarity scoring (token overlap + key term matching)
            text_score = self._compute_text_score(rec_text, cand_text)

            # Fee detection: small positive delta suggests bank fee
            fee_bonus = 0.0
            if 0 < amount_delta <= 50 and date_score > 0.3:
                fee_bonus = 0.15

            # Composite score
            raw_score = (amount_score * 0.45) + (date_score * 0.20) + (text_score * 0.25) + fee_bonus

            # Determine category
            if amount_delta <= tolerance and day_gap <= 2:
                category = "clean_match"
            elif fee_bonus > 0:
                category = "fee_adjusted"
            elif amount_delta <= tolerance and day_gap <= 7:
                category = "date_shift"
            elif text_score > 0.4:
                category = "fuzzy_desc"
            else:
                category = "ambiguous"

            confidence = min(1.0, 0.55 + raw_score * 0.45)

            reasoning_parts = []
            if amount_delta < 0.01:
                reasoning_parts.append(f"Exact amount match ({cand_amount:.2f})")
            elif amount_delta <= tolerance:
                reasoning_parts.append(f"Amount within tolerance (delta={amount_delta:.2f}, tolerance={tolerance:.2f})")
            else:
                reasoning_parts.append(f"Amount difference {amount_delta:.2f} exceeds tolerance {tolerance:.2f}")

            if day_gap <= 2:
                reasoning_parts.append(f"Date within 2 days ({day_gap}d gap)")
            elif day_gap <= 7:
                reasoning_parts.append(f"Date within settlement window ({day_gap}d gap)")
            else:
                reasoning_parts.append(f"Date gap of {day_gap} days is large")

            if text_score > 0.3:
                reasoning_parts.append(f"Text similarity {text_score:.2f}")
            if fee_bonus > 0:
                reasoning_parts.append(f"Fee adjustment likely (small amount delta)")

            reasoning = "; ".join(reasoning_parts)

            if best is None or confidence > best["confidence"]:
                best = {
                    "candidate_id": cand["record_id"],
                    "confidence": confidence,
                    "reasoning": reasoning,
                    "category": category,
                    "amount_delta": amount_delta,
                    "date_gap": day_gap,
                    "text_score": text_score,
                }
        return best

    def _offline_exception_explanation(self, payload: dict[str, Any]) -> ExceptionExplanation:
        """Generate a detailed, record-specific exception explanation with exact deltas."""
        record = payload.get("record", {})
        reason_category = payload.get("reason_category", "unknown")
        best = payload.get("best_candidate")
        record_id = record.get("record_id", "unknown")
        record_amount = float(record.get("amount", 0))
        record_text = str(record.get("text", record.get("description", record.get("memo", ""))))
        record_date = str(record.get("date", ""))

        # Extract best-candidate deltas
        cand_id = best.get("candidate_id", "N/A") if best else None
        cand_type = best.get("target_type", "") if best else ""
        cand_confidence = float(best.get("confidence", 0)) if best else 0.0
        cand_amount_delta = float(best.get("amount_delta", 0)) if best else 0.0
        cand_date_gap = int(best.get("date_gap_days", best.get("date_gap", 0))) if best else 0
        cand_text_sim = float(best.get("text_similarity", 0)) if best else 0.0
        cand_reasoning = best.get("reasoning", "") if best else ""

        explanation = ""
        suggested_action = ""

        if reason_category == "missing_counterpart":
            if best:
                # Build specific explanation based on actual deltas
                parts = [
                    f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) has no confirmed match."
                ]
                parts.append(
                    f"Closest candidate: {cand_id} ({cand_type}) at {cand_confidence*100:.0f}% confidence."
                )
                # Explain WHY it failed the threshold
                if cand_amount_delta > 0:
                    parts.append(
                        f"Amount differs by {cand_amount_delta:.2f}"
                    )
                else:
                    parts.append("Amounts match exactly")
                if cand_date_gap > 0:
                    parts.append(f"dates are {cand_date_gap} day(s) apart")
                else:
                    parts.append("dates are within tolerance")
                if cand_text_sim > 0:
                    parts.append(f"description similarity: {cand_text_sim*100:.0f}%")
                parts.append("— but combined score was below the matching threshold.")
                explanation = " ".join(parts)

                # Tailor action to the actual gap
                if cand_amount_delta > 0 and cand_amount_delta <= 50:
                    suggested_action = (
                        f"Likely a fee adjustment ({cand_amount_delta:.2f} delta). "
                        "Check for a bank fee journal entry. If found, approve with adjustment noted."
                    )
                elif cand_date_gap > 3:
                    suggested_action = (
                        f"Date gap of {cand_date_gap} days suggests weekend/holiday delay. "
                        "Verify posting dates and approve if this is a normal settlement lag."
                    )
                elif cand_text_sim > 0.3:
                    suggested_action = (
                        f"Description similarity is {cand_text_sim*100:.0f}% — partial text match found. "
                        "Compare full records side-by-side to confirm or reject this candidate."
                    )
                else:
                    suggested_action = (
                        "Review this record against source documents. "
                        "The closest candidate differs on multiple dimensions."
                    )
            else:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                    f"has no counterpart in any other source. "
                    f"Description: '{record_text}'. "
                    f"This typically means the transaction was not recorded in the accounting system, "
                    f"or it is a bank-initiated charge (fee, interest, adjustment)."
                )
                if abs(record_amount) <= 50:
                    suggested_action = (
                        f"Amount of {abs(record_amount):.2f} is small — likely a bank fee or service charge. "
                        "Create a journal entry if legitimate. Escalate if unrecognizable."
                    )
                else:
                    suggested_action = (
                        "Investigate this transaction. Check bank statement for supporting docs. "
                        "Create the missing journal entry or escalate for review."
                    )

        elif reason_category == "amount_mismatch":
            delta = cand_amount_delta
            if best:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}) has a candidate match "
                    f"{cand_id} ({cand_type}), but amounts differ by {delta:.2f}."
                )
                if delta <= 5:
                    explanation += (
                        f" The difference of {delta:.2f} is negligible and likely represents "
                        f"currency rounding. Confidence: {cand_confidence*100:.0f}%."
                    )
                    suggested_action = (
                        f"Round difference of {delta:.2f} — approve the match with a rounding note."
                    )
                elif delta <= 50:
                    explanation += (
                        f" This small delta ({delta:.2f}) suggests a processing fee, FX conversion, "
                        f"or bank charge deducted before settlement. Date gap: {cand_date_gap} day(s). "
                        f"Description similarity: {cand_text_sim*100:.0f}%."
                    )
                    suggested_action = (
                        f"Check for a fee of {delta:.2f} in the ledger. If found, approve with adjustment. "
                        "If not, create a journal entry for the fee amount."
                    )
                elif delta <= 200:
                    explanation += (
                        f" The moderate difference ({delta:.2f}) could indicate a partial payment, "
                        f"tax withholding, or manual adjustment. "
                        f"Date gap: {cand_date_gap} day(s). Confidence: {cand_confidence*100:.0f}%."
                    )
                    suggested_action = (
                        f"Review invoices for a {delta:.2f} partial payment or tax deduction. "
                        "Compare the two records side-by-side."
                    )
                else:
                    explanation += (
                        f" The large difference ({delta:.2f}) suggests these are likely unrelated "
                        f"transactions. Date gap: {cand_date_gap} day(s). "
                        f"Text similarity: {cand_text_sim*100:.0f}%."
                    )
                    suggested_action = (
                        "Do not auto-match. These records appear to be different transactions. "
                        "Verify each independently against source documents."
                    )
            else:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}) has no close candidate "
                    f"within tolerance. Amount delta to nearest: {delta:.2f}."
                )
                suggested_action = (
                    "No candidate within amount tolerance. "
                    "Check if this is an orphaned record requiring manual investigation."
                )

        elif reason_category == "duplicate_suspected":
            if best:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                    f"appears to be a duplicate. Candidate {cand_id} ({cand_type}) "
                    f"was already matched elsewhere with {cand_confidence*100:.0f}% confidence. "
                    f"Amount delta: {cand_amount_delta:.2f}, date gap: {cand_date_gap} day(s), "
                    f"text similarity: {cand_text_sim*100:.0f}%. "
                    f"This suggests the same transaction was entered twice in the system."
                )
                suggested_action = (
                    "Confirm with the accounting team whether this is a genuine duplicate. "
                    f"If confirmed, void or reverse {record_id}. "
                    "If not, investigate why two similar records exist in the same source."
                )
            else:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}) appears to be a duplicate — "
                    f"a similar record already exists and was matched."
                )
                suggested_action = (
                    "Review both records. If this is a double-entry, void the duplicate."
                )

        elif reason_category == "date_out_of_tolerance":
            if best:
                explanation = (
                    f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                    f"has a potential match {cand_id} ({cand_type}), but the date gap is "
                    f"{cand_date_gap} day(s) — exceeding the reconciliation window. "
                    f"Amount delta: {cand_amount_delta:.2f}, confidence: {cand_confidence*100:.0f}%."
                )
                if cand_date_gap <= 7:
                    explanation += (
                        f" The {cand_date_gap}-day gap is consistent with weekend/holiday cutoff "
                        f"or a batch file processed late."
                    )
                    suggested_action = (
                        f"Date gap of {cand_date_gap} days is likely a settlement delay. "
                        "Verify posting dates. If legitimate, approve with date variance noted."
                    )
                elif cand_date_gap <= 14:
                    explanation += (
                        f" The {cand_date_gap}-day gap suggests delayed posting or cross-border "
                        f"settlement lag."
                    )
                    suggested_action = (
                        f"Investigate the {cand_date_gap}-day delay. Check if this is a weekend/holiday "
                        "cutoff or a cross-border payment lag. Approve if confirmed."
                    )
                else:
                    explanation += (
                        f" The large {cand_date_gap}-day gap suggests these may be unrelated "
                        f"transactions or a significant processing error."
                    )
                    suggested_action = (
                        f"Date gap of {cand_date_gap} days is unusual. Investigate source documents "
                        "for both records. These may not be related."
                    )
            else:
                explanation = (
                    f"{record_id} (date: {record_date}) has no candidate within the date window."
                )
                suggested_action = "Check if this record belongs to a different reconciliation period."

        elif reason_category == "unresolved_ambiguous":
            explanation = (
                f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                f"has multiple plausible candidates but none clears the confidence threshold."
            )
            if best:
                explanation += (
                    f" Best candidate: {cand_id} ({cand_type}) at {cand_confidence*100:.0f}% confidence. "
                    f"Amount delta: {cand_amount_delta:.2f}, date gap: {cand_date_gap} day(s), "
                    f"text similarity: {cand_text_sim*100:.0f}%."
                )
            if record_text:
                explanation += f" Record text: '{record_text}'."
            suggested_action = (
                "Review this record manually with supporting documents. "
                "Compare amounts, dates, and descriptions side-by-side to determine "
                "the correct matching counterpart."
            )

        elif reason_category == "low_confidence_llm":
            explanation = (
                f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                f"was evaluated but confidence was below threshold."
            )
            if best:
                explanation += (
                    f" Best candidate: {cand_id} ({cand_type}) at {cand_confidence*100:.0f}%. "
                    f"Amount delta: {cand_amount_delta:.2f}, date gap: {cand_date_gap} day(s), "
                    f"text similarity: {cand_text_sim*100:.0f}%."
                )
                if cand_reasoning:
                    explanation += f" Engine reasoning: {cand_reasoning}"
            suggested_action = (
                "This requires human judgment. Review the record against all potential "
                "counterparts and make a determination based on available documentation."
            )
        else:
            explanation = (
                f"{record_id} (amount: {abs(record_amount):.2f}, date: {record_date}) "
                f"flagged as exception with category '{reason_category}'."
            )
            suggested_action = "Review manually and determine the appropriate action."

        return ExceptionExplanation(
            record_id=record_id,
            reason_category=reason_category,  # type: ignore[arg-type]
            explanation=explanation,
            suggested_action=suggested_action,
        )

    def _offline_qa(self, payload: dict[str, Any]) -> QAResponse:
        """Intelligent offline QA that analyzes context chunks to answer questions."""
        question = payload.get("question", "").lower()
        context = payload.get("context", [])

        if not context:
            return QAResponse(
                answer=(
                    "I don't have any reconciliation data to reference. "
                    "Please run a reconciliation first, then ask your question."
                ),
                cited_record_ids=[],
                confidence="low",
            )

        # Off-topic detection
        off_topic_terms = ["weather", "sports", "stock", "movie", "music", "recipe", "joke", "poem"]
        if any(term in question for term in off_topic_terms):
            return QAResponse(
                answer="I can only answer questions about your financial reconciliation data. Please ask about matches, exceptions, invoices, or cash position.",
                cited_record_ids=[],
                confidence="low",
            )

        # Classify the question type
        cited_ids = [chunk.get("record_id", "") for chunk in context[:6]]

        # Extract useful info from context
        records = [chunk for chunk in context if chunk.get("metadata", {}).get("kind") == "record"]
        exceptions = [chunk for chunk in context if chunk.get("metadata", {}).get("kind") == "exception"]
        matches = [chunk for chunk in context if chunk.get("metadata", {}).get("kind") == "match"]

        answer_parts: list[str] = []

        # Cash/balance questions
        if any(term in question for term in ["cash", "balance", "money", "position"]):
            bank_records = [r for r in records if r.get("metadata", {}).get("source_type") == "bank"]
            if bank_records:
                answer_parts.append(f"Based on the available bank records ({len(bank_records)} transactions), here is what I found:")
                for chunk in bank_records[:3]:
                    text = chunk.get("text", "")
                    answer_parts.append(f"• {text[:200]}")
            else:
                answer_parts.append("I found some relevant financial records in the context.")

        # Exception questions
        elif any(term in question for term in ["exception", "error", "problem", "wrong", "issue", "fail", "unmatch"]):
            if exceptions:
                answer_parts.append(f"I found {len(exceptions)} exception(s) in the context:")
                for chunk in exceptions[:4]:
                    text = chunk.get("text", "")
                    rid = chunk.get("record_id", "")
                    answer_parts.append(f"• {rid}: {text[:200]}")
            elif matches:
                answer_parts.append("The context contains matched records. No exceptions were found in the retrieved data.")
            else:
                answer_parts.append("The context contains some reconciliation records, but no specific exception details.")

        # Invoice questions
        elif any(term in question for term in ["invoice", "unpaid", "open", "receivable", "customer", "ar "]):
            invoice_records = [r for r in records if r.get("metadata", {}).get("source_type") == "invoice"]
            if invoice_records:
                answer_parts.append(f"Found {len(invoice_records)} invoice record(s):")
                for chunk in invoice_records[:4]:
                    text = chunk.get("text", "")
                    answer_parts.append(f"• {chunk.get('record_id', '')}: {text[:200]}")
            else:
                answer_parts.append("The retrieved context doesn't contain specific invoice records.")

        # Bill/vendor questions
        elif any(term in question for term in ["bill", "vendor", "payable", "ap "]):
            bill_records = [r for r in records if r.get("metadata", {}).get("source_type") == "bill"]
            if bill_records:
                answer_parts.append(f"Found {len(bill_records)} bill record(s):")
                for chunk in bill_records[:4]:
                    text = chunk.get("text", "")
                    answer_parts.append(f"• {chunk.get('record_id', '')}: {text[:200]}")
            else:
                answer_parts.append("The retrieved context doesn't contain specific bill records.")

        # Match questions
        elif any(term in question for term in ["match", "reconcil", "pair", "link"]):
            if matches:
                answer_parts.append(f"Found {len(matches)} match record(s):")
                for chunk in matches[:4]:
                    text = chunk.get("text", "")
                    answer_parts.append(f"• {chunk.get('record_id', '')}: {text[:200]}")
            else:
                answer_parts.append("The context contains records but no specific match details were retrieved.")

        # Duplicate questions
        elif any(term in question for term in ["duplicate", "double", "repeat"]):
            dup_exceptions = [e for e in exceptions if "duplicate" in e.get("text", "").lower()]
            if dup_exceptions:
                answer_parts.append(f"Found {len(dup_exceptions)} suspected duplicate(s):")
                for chunk in dup_exceptions[:4]:
                    text = chunk.get("text", "")
                    answer_parts.append(f"• {chunk.get('record_id', '')}: {text[:200]}")
            else:
                answer_parts.append("The retrieved context doesn't show any specific duplicate suspects.")

        # General / count questions
        elif any(term in question for term in ["how many", "count", "total", "number"]):
            answer_parts.append("Here is a summary from the retrieved context:")
            answer_parts.append(f"• Record chunks: {len(records)}")
            answer_parts.append(f"• Exception chunks: {len(exceptions)}")
            answer_parts.append(f"• Match chunks: {len(matches)}")
            answer_parts.append(f"• Total context pieces: {len(context)}")
            for chunk in context[:2]:
                text = chunk.get("text", "")
                answer_parts.append(f"• {text[:150]}")

        # Generic fallback — summarize what we have
        else:
            answer_parts.append("Based on the retrieved reconciliation context:")
            if records:
                answer_parts.append(f"• {len(records)} source record(s) found")
            if matches:
                answer_parts.append(f"• {len(matches)} match record(s) found")
            if exceptions:
                answer_parts.append(f"• {len(exceptions)} exception record(s) found")
            # Include a representative sample
            for chunk in context[:2]:
                text = chunk.get("text", "")
                answer_parts.append(f"• {text[:200]}")

        answer = "\n".join(answer_parts)

        # Determine confidence
        avg_score = sum(c.get("score", 0) for c in context) / len(context) if context else 0
        if avg_score > 0.6 and len(context) >= 3:
            confidence = "high"
        elif avg_score > 0.3 and len(context) >= 2:
            confidence = "medium"
        else:
            confidence = "low"

        return QAResponse(
            answer=answer[:1000],
            cited_record_ids=[cid for cid in cited_ids if cid][:6],
            confidence=confidence,  # type: ignore[arg-type]
        )

    def _offline_grounded_explanation(self, payload: dict[str, Any]) -> GroundedExplanation:
        """Generate a detailed grounded explanation for error evidence."""
        ev = payload.get("evidence", {})
        status = payload.get("status", "UNKNOWN")
        record_id = payload.get("record_id", "")
        diff = float(ev.get("amountDifference", 0))
        date_diff = int(ev.get("dateDifference", 0))
        desc_sim = float(ev.get("descriptionSimilarity", 0))
        ref_match = ev.get("referenceMatch", False)
        amt_match = ev.get("amountMatch", False)
        fee_found = ev.get("feeAdjustmentFound", False)
        tax_found = ev.get("taxAdjustmentFound", False)
        counter_match = ev.get("counterpartyMatch", False)

        # Build evidence summary
        evidence_parts = []
        if diff > 0:
            evidence_parts.append(f"Amount difference: {diff:.2f}")
        if date_diff > 0:
            evidence_parts.append(f"Date gap: {date_diff} days")
        if desc_sim > 0:
            evidence_parts.append(f"Description similarity: {desc_sim*100:.0f}%")
        if fee_found:
            evidence_parts.append("Fee adjustment detected")
        if tax_found:
            evidence_parts.append("Tax adjustment detected")
        evidence_parts.append(f"Status: {status}")
        evidence_summary = "; ".join(evidence_parts) if evidence_parts else f"Status: {status}"

        # Determine explanation and causes based on evidence
        if diff > 0 and fee_found:
            summary = (
                f"Record {record_id} has a small amount variance of {diff:.2f} that appears to be "
                f"a processing fee deduction. This is a common pattern where the bank deducts "
                f"a transaction fee before settling the payment."
            )
            causes = [
                "Bank processing fee deducted before settlement",
                "Payment gateway transaction charge",
                "Wire transfer fee",
                "FX conversion rounding difference",
            ]
            action = (
                "Check for a separate fee journal entry in the ledger. If one exists, "
                "approve the match with the fee adjustment. If not, create a journal entry "
                "for the fee amount."
            )
            certainty = "likely_explanation"
            confidence = 0.88

        elif diff > 0 and diff <= 200:
            summary = (
                f"Record {record_id} has a moderate amount variance of {diff:.2f}. "
                f"This could indicate a partial payment, tax withholding, or a manual "
                f"adjustment applied to the transaction."
            )
            causes = [
                "Partial payment settlement",
                "Tax/GST withholding difference",
                "Manual adjustment by accounting staff",
                "Currency conversion difference",
            ]
            action = (
                "Review the original invoice and payment records. Check if a partial "
                "settlement was applied, or if there's a tax adjustment that needs recording."
            )
            certainty = "likely_explanation"
            confidence = 0.75

        elif diff > 200:
            summary = (
                f"Record {record_id} has a large amount variance of {diff:.2f}. "
                f"These records may be entirely unrelated transactions that happen to "
                f"share some attributes, or there may be a significant posting error."
            )
            causes = [
                "Potentially unrelated transactions",
                "Significant posting or data entry error",
                "Aggregated payment covering multiple invoices",
            ]
            action = (
                "Do not auto-match. Verify each record independently against source "
                "documents. Check if this is an aggregated payment or a posting error."
            )
            certainty = "unknown"
            confidence = 0.45

        elif date_diff > 5:
            summary = (
                f"Record {record_id} posted with a date delay of {date_diff} days. "
                f"While some delay is normal for bank settlements, this exceeds the "
                f"standard reconciliation window."
            )
            causes = [
                "Weekend or bank holiday cutoff delay",
                "Delayed batch file posting",
                "Cross-border payment settlement lag",
                "Check still in transit / not yet cleared",
            ]
            action = (
                "Verify the settlement cutoff timestamp with the banking partner. "
                "If this is a legitimate delay, approve the match with the date variance noted."
            )
            certainty = "likely_explanation"
            confidence = 0.72

        elif "duplicate" in status.lower():
            summary = (
                f"Record {record_id} appears to be a duplicate entry. "
                f"A similar record was already matched, suggesting this was entered twice."
            )
            causes = [
                "Double data entry by accounting staff",
                "Automated import ran twice",
                "Reversal entry that wasn't properly voided",
            ]
            action = (
                "Confirm with the accounting team whether this is a genuine duplicate. "
                "If confirmed, void or reverse the duplicate entry."
            )
            certainty = "likely_explanation"
            confidence = 0.80

        elif "missing" in status.lower() or amt_match is False and counter_match is False:
            summary = (
                f"Record {record_id} has no matching counterpart in the target ledger. "
                f"The evidence shows: amount match = {amt_match}, reference match = {ref_match}, "
                f"counterparty match = {counter_match}."
            )
            causes = [
                "Unposted transaction in general ledger",
                "Bank-initiated charge not yet recorded",
                "Timing difference across period end",
                "Transaction was voided on one side only",
            ]
            action = (
                "Request the counterparty bank statement or verify journal posting. "
                "If this is a legitimate bank charge, create the missing journal entry."
            )
            certainty = "unknown"
            confidence = 0.55

        else:
            summary = (
                f"Record {record_id} was flagged as an exception with status '{status}'. "
                f"Evidence: {evidence_summary}"
            )
            causes = [
                "Data entry inconsistency",
                "System processing delay",
                "Incomplete transaction lifecycle",
            ]
            action = (
                "Review the record against all available source documents. "
                "Determine the appropriate action based on the evidence."
            )
            certainty = "unknown"
            confidence = 0.50

        return GroundedExplanation(
            explanation=summary,
            confidence=confidence,
            evidence_summary=evidence_summary,
            possible_causes=causes,
            recommended_action=action,
            certainty=certainty,  # type: ignore[arg-type]
        )

    # ─── Utilities ─────────────────────────────────────────────────────────

    @staticmethod
    def _parse_date(value: Any) -> date | None:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        try:
            return datetime.fromisoformat(str(value)).date()
        except Exception:
            return None

    @staticmethod
    def _compute_text_score(left: str, right: str) -> float:
        """Compute text similarity using token overlap and key-term matching."""
        if not left or not right:
            return 0.0
        left_tokens = set(left.split())
        right_tokens = set(right.split())
        if not left_tokens or not right_tokens:
            return 0.0
        # Jaccard similarity
        jaccard = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        # Key term bonus: check for invoice numbers, amounts, names
        key_patterns = ["inv", "bill", "led", "bank", "pmt", "ach", "wire", "fee", "chrg", "settlement"]
        key_matches = sum(1 for p in key_patterns if p in left and p in right)
        key_bonus = min(0.2, key_matches * 0.05)
        return min(1.0, jaccard + key_bonus)

    def _offline_embedding(self, text: str) -> list[float]:
        """Deterministic offline embedding using content hashing."""
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
