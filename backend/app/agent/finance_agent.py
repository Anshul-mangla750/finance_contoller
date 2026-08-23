from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.agent.memory import ConversationMemory
from app.agent.prompts import AGENT_SYSTEM_PROMPT, ROUTER_TEMPLATE
from app.agent.tools.finance_qa_tool import FinanceQATool
from app.agent.tools.retriever_tool import DocumentRetrieverTool
from app.agent.tools.sql_tool import ReadOnlySQLTool
from app.db import get_session
from app.llm.schemas import QAResponse
from app.models.schemas import ExceptionRecord, MatchRecord, ReconciliationRun
from sqlmodel import select


def _is_summary_question(question: str) -> bool:
    lowered = question.lower()
    return any(
        term in lowered
        for term in [
            "how many",
            "count",
            "total",
            "number of exceptions",
            "exception count",
            "summary",
            "overview",
            "match rate",
            "precision",
            "recall",
            "f1",
            "cash position",
            "current cash",
        ]
    )


def _build_summary_response(question: str) -> QAResponse | None:
    with get_session() as session:
        run = session.exec(select(ReconciliationRun).order_by(ReconciliationRun.created_at.desc())).first()
        if run is None:
            return None
        exceptions = session.exec(select(ExceptionRecord).where(ExceptionRecord.run_id == run.id).order_by(ExceptionRecord.id)).all()

    lowered = question.lower()
    if any(term in lowered for term in ["how many", "count", "total", "number of exceptions", "exception count"]):
        answer = (
            f"The latest reconciliation run has {run.exception_count} exception(s), "
            f"{run.matched_count} matched record(s), and {run.total_records} total record(s)."
        )
        cited = [item.record_id for item in exceptions[:6] if item.record_id]
        return QAResponse(answer=answer, cited_record_ids=cited, confidence="high")

    if any(term in lowered for term in ["match rate", "precision", "recall", "f1", "cash position", "current cash"]):
        answer = (
            f"Latest run metrics: match rate {run.match_rate:.3f}, "
            f"precision {run.precision:.3f}, recall {run.recall:.3f}, "
            f"F1 {run.f1:.3f}, cash position {run.cash_position:.2f}."
        )
        cited = [item.record_id for item in exceptions[:3] if item.record_id]
        return QAResponse(answer=answer, cited_record_ids=cited, confidence="high")

    return None


def _is_exception_list_question(question: str) -> bool:
    lowered = question.lower()
    return any(
        phrase in lowered
        for phrase in [
            "list of exceptions",
            "list exceptions",
            "show exceptions",
            "show me the exceptions",
            "recent run",
            "latest run",
            "current run",
            "open exceptions",
            "exception list",
            "all exceptions",
            "what are the exceptions",
            "which exceptions",
        ]
    ) or ("exception" in lowered and any(term in lowered for term in ["list", "show", "recent", "latest", "current", "all", "which"]))


def _build_exception_list_response(question: str) -> QAResponse | None:
    with get_session() as session:
        run = session.exec(select(ReconciliationRun).order_by(ReconciliationRun.created_at.desc())).first()
        if run is None:
            return None
        exceptions = session.exec(select(ExceptionRecord).where(ExceptionRecord.run_id == run.id).order_by(ExceptionRecord.id)).all()

    if not exceptions:
        return QAResponse(
            answer="The latest reconciliation run completed without any exceptions.",
            cited_record_ids=[],
            confidence="high",
        )

    cited = [item.record_id for item in exceptions if item.record_id]
    lines = []
    for index, item in enumerate(exceptions, start=1):
        status = item.status.replace("_", " ").lower()
        lines.append(f"{index}. {item.record_id} - {status}")

    answer = (
        f"The latest reconciliation run has {run.exception_count} exception(s). "
        "Here is the exception list:\n" + "\n".join(lines)
    )
    return QAResponse(answer=answer, cited_record_ids=cited, confidence="high")


def _extract_record_id(question: str) -> str | None:
    match = re.search(r"\b((?:INV|BILL|BANK|LED|TXN)-[A-Z0-9\-]+)\b", question.upper())
    return match.group(1) if match else None


def _format_evidence_summary(evidence_json: str | None) -> str:
    if not evidence_json:
        return "No structured evidence stored."

    try:
        evidence = json.loads(evidence_json)
    except Exception:
        return evidence_json.strip() or "No structured evidence stored."

    def _stringify(value: Any) -> str:
        if isinstance(value, dict):
            items = []
            for key, item in list(value.items())[:4]:
                items.append(f"{key}={_stringify(item)}")
            return ", ".join(items) if items else "{}"
        if isinstance(value, list):
            preview = [_stringify(item) for item in value[:4]]
            return "[" + ", ".join(preview) + (", ..." if len(value) > 4 else "") + "]"
        return str(value)

    if isinstance(evidence, dict):
        preferred_keys = [
            "matched_fields",
            "amount_diff",
            "date_diff",
            "candidate_count",
            "source",
            "reason",
        ]
        ordered_keys = [key for key in preferred_keys if key in evidence]
        ordered_keys.extend(key for key in evidence.keys() if key not in ordered_keys)
        summary_parts = []
        for key in ordered_keys[:5]:
            summary_parts.append(f"{key}={_stringify(evidence[key])}")
        return "; ".join(summary_parts) if summary_parts else "Structured evidence present."

    if isinstance(evidence, list):
        preview = ", ".join(_stringify(item) for item in evidence[:4])
        return preview if preview else "Structured evidence present."

    return str(evidence)


def _is_exception_explanation_question(question: str) -> bool:
    lowered = question.lower()
    record_id_present = _extract_record_id(question) is not None
    return record_id_present and any(
        term in lowered
        for term in [
            "why",
            "why is",
            "why was",
            "explain",
            "reason",
            "exception",
            "flagged",
            "missing",
            "duplicate",
            "unresolved",
            "problem",
            "issue",
        ]
    )


def _build_exception_explanation_response(question: str) -> QAResponse | None:
    record_id = _extract_record_id(question)
    if not record_id:
        return None

    with get_session() as session:
        exc = session.exec(select(ExceptionRecord).where(ExceptionRecord.record_id == record_id)).first()
        if exc is not None:
            reason = exc.reason_category.replace("_", " ").strip()
            status = exc.status.replace("_", " ").strip()
            best_candidate = "None"
            if exc.best_candidate_id:
                candidate = exc.best_candidate_id
                if exc.best_candidate_type:
                    candidate = f"{exc.best_candidate_type}:{candidate}"
                if exc.best_candidate_confidence is not None:
                    best_candidate = f"{candidate} ({round(exc.best_candidate_confidence * 100)}% confidence)"
                else:
                    best_candidate = candidate
            evidence = _format_evidence_summary(exc.evidence_json)
            parts = [
                f"Reason: {reason}. {exc.explanation}",
                f"Status: {status}.",
                f"Suggested action: {exc.suggested_action}",
                f"Best candidate: {best_candidate}",
                f"Evidence: {evidence}",
            ]
            cited = [record_id]
            if exc.best_candidate_id:
                cited.append(exc.best_candidate_id)
            return QAResponse(answer=" ".join(parts), cited_record_ids=cited, confidence="high")

        match = session.exec(
            select(MatchRecord).where((MatchRecord.source_a_id == record_id) | (MatchRecord.source_b_id == record_id))
        ).first()
        if match is not None:
            evidence = _format_evidence_summary(match.evidence_json)
            parts = [
                "Reason: This record is not flagged as an exception in the latest run.",
                f"Status: matched on layer {match.match_layer} as {match.match_kind.replace('_', ' ')}.",
                "Suggested action: No action required.",
                "Best candidate: None",
                f"Evidence: {match.reasoning}" + (f"; {evidence}" if evidence != "No structured evidence stored." else ""),
            ]
            cited = [record_id]
            if match.source_a_id and match.source_a_id != record_id:
                cited.append(match.source_a_id)
            if match.source_b_id and match.source_b_id != record_id:
                cited.append(match.source_b_id)
            return QAResponse(answer=" ".join(parts), cited_record_ids=cited, confidence="high")

    return None


@dataclass
class _ToolBundle:
    finance_qa: FinanceQATool
    document: DocumentRetrieverTool
    sql: ReadOnlySQLTool


class FinanceAgent:
    def __init__(
        self,
        finance_qa_tool: FinanceQATool | None = None,
        document_retriever_tool: DocumentRetrieverTool | None = None,
        sql_query_tool: ReadOnlySQLTool | None = None,
        memory: ConversationMemory | None = None,
        use_llm_router: bool = True,
    ) -> None:
        self.tools = _ToolBundle(
            finance_qa=finance_qa_tool or FinanceQATool(),
            document=document_retriever_tool or DocumentRetrieverTool(),
            sql=sql_query_tool or ReadOnlySQLTool(),
        )
        self.memory = memory or ConversationMemory()
        self.use_llm_router = use_llm_router

    def ask(self, question: str) -> QAResponse:
        prompt = question.strip()
        if not prompt:
            return QAResponse(answer="Please ask a finance question.", cited_record_ids=[], confidence="low")

        self.memory.add_user_message(prompt)

        if _is_exception_explanation_question(prompt):
            exception_explanation = _build_exception_explanation_response(prompt)
            if exception_explanation is not None:
                self.memory.add_ai_message(exception_explanation.answer)
                return exception_explanation

        if _is_exception_list_question(prompt):
            exception_list = _build_exception_list_response(prompt)
            if exception_list is not None:
                self.memory.add_ai_message(exception_list.answer)
                return exception_list

        summary = _build_summary_response(prompt)
        if summary is not None:
            self.memory.add_ai_message(summary.answer)
            return summary

        tool_name, rewritten_query = self._route_question(prompt)
        history = self.memory.render()

        if tool_name == "document_retriever_tool":
            response = self.tools.document.answer(rewritten_query, history=history)
        elif tool_name == "sql_query_tool":
            response = self.tools.sql.answer(rewritten_query, history=history)
        elif tool_name == "direct_answer":
            response = self.tools.finance_qa.answer(rewritten_query, history=history)
        else:
            response = self.tools.finance_qa.answer(rewritten_query, history=history)

        self.memory.add_ai_message(response.answer)
        return response

    def _route_question(self, question: str) -> tuple[str, str]:
        if self.use_llm_router:
            router_payload = self._llm_router(question)
            if router_payload is not None:
                return router_payload
        return self._heuristic_router(question)

    def _llm_router(self, question: str) -> tuple[str, str] | None:
        try:
            from app.config import get_settings
            from google import genai

            settings = get_settings()
            if not settings.gemini_api_key:
                return None
            router_template = f"{AGENT_SYSTEM_PROMPT}\n\n{ROUTER_TEMPLATE}"
            prompt_text = router_template.format(question=question, history=self.memory.render())

            text = ""
            try:
                from langchain_core.output_parsers import StrOutputParser
                from langchain_core.prompts import PromptTemplate
                from langchain_google_genai import ChatGoogleGenerativeAI

                router = PromptTemplate.from_template(router_template) | ChatGoogleGenerativeAI(
                    model=settings.llm_model,
                    google_api_key=settings.gemini_api_key,
                    temperature=0,
                ) | StrOutputParser()
                text = router.invoke({"question": question, "history": self.memory.render()})
            except Exception:
                client = genai.Client(api_key=settings.gemini_api_key)
                response = client.models.generate_content(model=settings.llm_model, contents=prompt_text)
                text = getattr(response, "text", "") or ""

            if not text.strip():
                return None
            payload = json.loads(self._extract_json(text))
            tool_name = str(payload.get("tool", "")).strip()
            rewritten_query = str(payload.get("rewritten_query", question)).strip() or question
            if tool_name in {"finance_qa_tool", "document_retriever_tool", "sql_query_tool", "direct_answer"}:
                return tool_name, rewritten_query
        except Exception:
            return None
        return None

    def _heuristic_router(self, question: str) -> tuple[str, str]:
        lowered = question.lower()

        if any(term in lowered for term in ["hello", "hi", "hey", "thanks", "thank you"]):
            return "direct_answer", question

        if _is_summary_question(question):
            return "sql_query_tool", question

        if _is_exception_explanation_question(question):
            return "document_retriever_tool", question

        if (
            any(term in lowered for term in ["document", "uploaded file", "uploaded files", "evidence", "match"])
            or (("why" in lowered or "explain" in lowered) and "exception" in lowered)
        ) and not self._has_explicit_record_id(question):
            return "document_retriever_tool", question

        if self._has_explicit_record_id(question) or any(
            term in lowered for term in ["invoice", "invoices", "bank", "bank statement", "transaction", "transactions", "ledger", "bill", "bills", "rows", "lookup", "show me"]
        ):
            return "sql_query_tool", question

        return "finance_qa_tool", question

    @staticmethod
    def _has_explicit_record_id(question: str) -> bool:
        return _extract_record_id(question) is not None

    @staticmethod
    def _extract_json(text: str) -> str:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]
        return text


def create_default_finance_agent() -> FinanceAgent:
    return FinanceAgent()
