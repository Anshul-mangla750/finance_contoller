from __future__ import annotations

from typing import Any

from app.llm.gemini_client import GeminiClient
from app.llm.schemas import QAResponse
from app.rag.retriever import Retriever


class QAAgent:
    def __init__(self, retriever: Retriever | None = None, client: GeminiClient | None = None):
        self.retriever = retriever or Retriever()
        self.client = client or GeminiClient()

    def ask(self, question: str) -> QAResponse:
        metadata_filter = self._select_filter(question)
        context = self.retriever.retrieve(question, k=10, metadata_filter=metadata_filter)
        payload = {
            "question": question,
            "context": context,
        }
        return self.client.structured_call("qa_response", QAResponse, payload)

    def _select_filter(self, question: str) -> dict[str, Any] | None:
        """Smart query routing — only filter when the question clearly targets one source."""
        lowered = question.lower()

        # Exception-specific queries
        if any(term in lowered for term in [
            "why didn't", "exception", "not match", "unmatched", "error",
            "problem", "wrong", "issue", "unresolved",
        ]):
            return {"kind": "exception"}

        # Invoice-specific queries
        if any(term in lowered for term in [
            "unpaid", "open invoice", "receivable", "customer owe", "outstanding invoice",
        ]):
            return {"kind": "record", "source_type": "invoice"}

        # Bill-specific queries
        if any(term in lowered for term in [
            "bill", "vendor owe", "payable", "outstanding bill",
        ]):
            return {"kind": "record", "source_type": "bill"}

        # Match-specific queries
        if any(term in lowered for term in [
            "matched", "reconciled pair", "successfully matched",
        ]):
            return {"kind": "match"}

        # KPI/summary queries — no filter, get everything
        if any(term in lowered for term in [
            "how many", "total", "summary", "overview", "count",
            "match rate", "precision", "recall", "cash",
        ]):
            return None

        # General queries — no filter
        return None
