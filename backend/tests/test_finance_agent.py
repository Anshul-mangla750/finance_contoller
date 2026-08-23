from __future__ import annotations

import sqlite3
from pathlib import Path

from app.agent.finance_agent import FinanceAgent
from app.agent.tools.finance_qa_tool import FinanceQATool
from app.agent.tools.retriever_tool import DocumentRetrieverTool
from app.agent.tools.sql_tool import ReadOnlySQLTool
from app.llm.schemas import QAResponse
from app.services.reconciliation_service import run_full_reconciliation


class FakeFinanceTool(FinanceQATool):
    def answer(self, question: str, history: str = "") -> QAResponse:  # type: ignore[override]
        return QAResponse(answer=f"finance:{question}", cited_record_ids=[], confidence="high")


class FakeDocumentTool(DocumentRetrieverTool):
    def __init__(self):
        pass

    def answer(self, question: str, history: str = "") -> QAResponse:  # type: ignore[override]
        return QAResponse(answer=f"docs:{question}", cited_record_ids=["INV-1001"], confidence="medium")


class FakeSQLTool(ReadOnlySQLTool):
    def __init__(self):
        pass

    def answer(self, question: str, history: str = "") -> QAResponse:  # type: ignore[override]
        return QAResponse(answer=f"sql:{question}", cited_record_ids=["BANK-0001"], confidence="medium")


def test_agent_routes_general_finance_question():
    agent = FinanceAgent(FakeFinanceTool(), FakeDocumentTool(), FakeSQLTool(), use_llm_router=False)

    response = agent.ask("What is working capital?")

    assert response.answer.startswith("finance:")
    assert response.confidence == "high"


def test_finance_qa_tool_structures_cashflow_answer():
    tool = FinanceQATool()

    response = tool.answer("explain cashflow in detail")

    assert "Concept: Cash flow" in response.answer
    assert "Definition:" in response.answer
    assert "Key points:" in response.answer
    assert "Example:" in response.answer
    assert "Takeaway:" in response.answer
    assert "cash flow" in response.answer.lower()


def test_agent_routes_document_question():
    agent = FinanceAgent(FakeFinanceTool(), FakeDocumentTool(), FakeSQLTool(), use_llm_router=False)

    response = agent.ask("Why is the invoice flagged in the documents?")

    assert response.answer.startswith("docs:")
    assert response.cited_record_ids == ["INV-1001"]


def test_agent_routes_sql_question():
    agent = FinanceAgent(FakeFinanceTool(), FakeDocumentTool(), FakeSQLTool(), use_llm_router=False)

    response = agent.ask("Show me invoice INV-1001")

    assert response.answer.startswith("sql:")
    assert response.cited_record_ids == ["BANK-0001"]


def test_sql_tool_reads_records_from_sqlite(tmp_path: Path):
    db_path = tmp_path / "finance.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE invoice (invoice_id TEXT PRIMARY KEY, customer TEXT, amount REAL, issue_date TEXT, due_date TEXT, status TEXT, linked_ledger_id TEXT, source_type TEXT, created_at TEXT)"
        )
        conn.execute(
            "INSERT INTO invoice VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("INV-1001", "Acme", 120.5, "2026-08-01", "2026-08-15", "OPEN", None, "invoice", "2026-08-01"),
        )
        conn.commit()
    finally:
        conn.close()

    tool = ReadOnlySQLTool(db_path=db_path)
    response = tool.answer("Show invoice INV-1001")

    assert "INV-1001" in response.answer
    assert "Reason:" in response.answer
    assert "Status:" in response.answer
    assert "Suggested action:" in response.answer
    assert "Best candidate:" in response.answer
    assert "Evidence:" in response.answer
    assert response.cited_record_ids == ["INV-1001"]


def test_sql_tool_prefers_record_prefix_over_question_noun(tmp_path: Path):
    db_path = tmp_path / "finance.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE invoice (invoice_id TEXT PRIMARY KEY, customer TEXT, amount REAL, issue_date TEXT, due_date TEXT, status TEXT, linked_ledger_id TEXT, source_type TEXT, created_at TEXT)"
        )
        conn.execute(
            "CREATE TABLE banktxn (txn_id TEXT PRIMARY KEY, date TEXT, amount REAL, description TEXT, running_balance REAL, source_type TEXT, created_at TEXT)"
        )
        conn.execute(
            "INSERT INTO invoice VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("INV-2001", "Acme", 220.0, "2026-08-01", "2026-08-15", "OPEN", None, "invoice", "2026-08-01"),
        )
        conn.execute(
            "INSERT INTO banktxn VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("TXN-2001-1", "2026-08-02", 220.0, "Acme payment", 1200.0, "bank", "2026-08-02"),
        )
        conn.commit()
    finally:
        conn.close()

    tool = ReadOnlySQLTool(db_path=db_path)
    response = tool.answer("give me invoice TXN-2001-1")

    assert "TXN-2001-1" in response.answer
    assert "bank transaction" in response.answer.lower()
    assert "Reason:" in response.answer
    assert "Status:" in response.answer
    assert "Evidence:" in response.answer
    assert response.cited_record_ids == ["TXN-2001-1"]


def test_agent_lists_exceptions_from_latest_run():
    result = run_full_reconciliation(seed=20260822)
    agent = FinanceAgent(use_llm_router=False)

    response = agent.ask("give me list of exceptions in my recent run")

    assert "The latest reconciliation run has" in response.answer
    assert str(result["kpis"]["exception_count"]) in response.answer
    assert "Here is the exception list" in response.answer


def test_agent_explains_why_a_record_is_an_exception():
    run_full_reconciliation(seed=20260822)
    agent = FinanceAgent(use_llm_router=False)

    response = agent.ask("why is TXN-0001-2 an exception")

    assert "TXN-0001-2" in response.answer
    assert "Reason:" in response.answer
    assert "Status:" in response.answer
    assert "Suggested action:" in response.answer
    assert "Best candidate:" in response.answer
    assert "Evidence:" in response.answer
    assert "duplicate" in response.answer.lower() or "reason" in response.answer.lower()
