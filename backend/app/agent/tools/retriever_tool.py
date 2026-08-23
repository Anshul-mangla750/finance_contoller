from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.agent.prompts import document_rag_prompt
from app.llm.schemas import QAResponse
from app.rag.retriever import Retriever


@dataclass
class DocumentRetrieverTool:
    retriever: Retriever | None = None

    def __post_init__(self) -> None:
        if self.retriever is None:
            self.retriever = Retriever()

    def answer(self, question: str, history: str = "") -> QAResponse:
        assert self.retriever is not None
        matches = self.retriever.retrieve(question, k=8)
        if not matches:
            return QAResponse(
                answer="I don't have that information in your documents.",
                cited_record_ids=[],
                confidence="low",
            )

        context = "\n".join(
            f"- {item.get('record_id', item.get('id', 'unknown'))} | score={item.get('score', 0):.3f} | {item.get('text', '')[:350]}"
            for item in matches
        )
        prompt = document_rag_prompt()
        _ = prompt.format(question=question, history=history, context=context) if hasattr(prompt, "format") else str(prompt)

        try:
            from app.llm.schemas import QAResponse as QAResponseSchema
            from app.llm.gemini_client import GeminiClient

            client = GeminiClient()
            response = client.structured_call("qa_response", QAResponseSchema, {"question": question, "context": matches})
            if isinstance(response, QAResponseSchema):
                return response
        except Exception:
            pass

        cited = [item.get("record_id", item.get("id", "")) for item in matches[:6] if item.get("record_id") or item.get("id")]
        summary = matches[0].get("text", "")[:500]
        return QAResponse(
            answer=(
                f"Here are the most relevant document snippets I found:\n"
                f"{summary}\n\n"
                "If you want a stricter grounded answer, ask for a specific record ID or document section."
            ),
            cited_record_ids=cited,
            confidence="medium",
        )


def create_document_retriever_tool(tool: DocumentRetrieverTool | None = None):
    tool = tool or DocumentRetrieverTool()

    def _run(question: str, history: str = "") -> dict[str, Any]:
        response = tool.answer(question, history=history)
        return response.model_dump()

    return _run

