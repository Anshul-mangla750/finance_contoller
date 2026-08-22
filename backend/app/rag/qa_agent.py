from __future__ import annotations

from typing import Any

from app.llm.gemini_client import GeminiClient
from app.llm.schemas import QAResponse
from app.llm.prompts import build_qa_prompt
from app.rag.retriever import Retriever


class QAAgent:
    def __init__(self, retriever: Retriever | None = None, client: GeminiClient | None = None):
        self.retriever = retriever or Retriever()
        self.client = client or GeminiClient()

    def ask(self, question: str) -> QAResponse:
        metadata_filter = self._select_filter(question)
        context = self.retriever.retrieve(question, k=8, metadata_filter=metadata_filter)
        payload = {
            "question": question,
            "context": context,
        }
        return self.client.structured_call("qa_response", QAResponse, payload)

    def _select_filter(self, question: str) -> dict[str, Any] | None:
        lowered = question.lower()
        if "why didn't" in lowered or "exception" in lowered or "not match" in lowered:
            return {"source_type": "exception"}
        if "unpaid" in lowered or "open invoice" in lowered:
            return {"source_type": "invoice"}
        if "bill" in lowered or "vendor" in lowered:
            return {"source_type": "bill"}
        return None

