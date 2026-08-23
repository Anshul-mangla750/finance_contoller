from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.agent.prompts import sql_tool_prompt
from app.config import get_settings
from app.llm.schemas import QAResponse


TABLE_ALIASES: dict[str, str] = {
    "invoice": "invoice",
    "invoices": "invoice",
    "bank": "banktxn",
    "bank statement": "banktxn",
    "bank statements": "banktxn",
    "transaction": "banktxn",
    "transactions": "banktxn",
    "txn": "banktxn",
    "ledger": "ledgerentry",
    "ledger entry": "ledgerentry",
    "ledger entries": "ledgerentry",
    "bill": "bill",
    "bills": "bill",
}

ALLOWED_TABLES = {"banktxn", "ledgerentry", "invoice", "bill", "exceptionrecord", "matchrecord", "reconciliationrun"}
MAX_ROWS = 10


@dataclass
class ReadOnlySQLTool:
    db_path: Path | None = None

    def __post_init__(self) -> None:
        settings = get_settings()
        self.db_path = self.db_path or settings.database_path

    def answer(self, question: str, history: str = "") -> QAResponse:
        prompt = sql_tool_prompt()
        _ = prompt.format(question=question, history=history, results="") if hasattr(prompt, "format") else str(prompt)
        try:
            rows, lookup_note, selected_table = self._lookup(question)
        except Exception as exc:
            return QAResponse(
                answer=f"I couldn't run that database lookup safely: {exc}",
                cited_record_ids=[],
                confidence="low",
            )

        if not rows:
            return QAResponse(
                answer="I couldn't find matching records in the database.",
                cited_record_ids=[],
                confidence="low",
            )

        cited = []
        best_candidate = self._row_record_id(rows[0])
        evidence_lines = []
        for row in rows:
            record_id = self._row_record_id(row)
            if record_id:
                cited.append(record_id)
            evidence_lines.append(self._format_record_block(row, len(evidence_lines) + 1))

        reason = lookup_note or f"I searched the {selected_table.replace('txn', ' transaction').replace('entry', ' entry')} table and found matching record(s)."
        answer_parts = [
            f"Reason: {reason}",
            f"Status: Found {len(rows)} matching record(s) in the database.",
            "Suggested action: Review the evidence below or ask for a more specific field.",
            f"Best candidate: {best_candidate or 'None'}",
            "Evidence:",
            *evidence_lines,
        ]
        answer = "\n".join(answer_parts)
        return QAResponse(answer=answer, cited_record_ids=cited[:6], confidence="medium")

    def _lookup(self, question: str) -> tuple[list[dict[str, Any]], str | None, str]:
        normalized = question.lower()
        table = self._infer_table(normalized)
        record_id = self._extract_record_id(question)
        limit = MAX_ROWS

        if table is None:
            table = "invoice" if "invoice" in normalized else "banktxn" if "bank" in normalized or "transaction" in normalized else "bill" if "bill" in normalized else "ledgerentry"

        if table not in ALLOWED_TABLES:
            raise ValueError(f"Table '{table}' is not allowed.")

        candidate_tables = self._candidate_tables(table, record_id)
        for candidate in candidate_tables:
            query, params = self._build_query(candidate, record_id, normalized, limit)
            rows = self._run_select(query, params)
            if rows:
                return rows, self._lookup_note(table, candidate, record_id), candidate

        return [], self._lookup_note(table, candidate_tables[0], record_id) if candidate_tables else None, table

    def _build_query(self, table: str, record_id: str | None, normalized: str, limit: int) -> tuple[str, tuple[Any, ...]]:
        if record_id:
            if table == "invoice":
                return "SELECT * FROM invoice WHERE invoice_id = ? LIMIT ?", (record_id, limit)
            if table == "bill":
                return "SELECT * FROM bill WHERE bill_id = ? LIMIT ?", (record_id, limit)
            if table == "banktxn":
                return "SELECT * FROM banktxn WHERE txn_id = ? LIMIT ?", (record_id, limit)
            if table == "ledgerentry":
                return "SELECT * FROM ledgerentry WHERE entry_id = ? LIMIT ?", (record_id, limit)
        if table == "invoice":
            if "overdue" in normalized or "due" in normalized:
                return "SELECT * FROM invoice ORDER BY due_date DESC LIMIT ?", (limit,)
            return "SELECT * FROM invoice ORDER BY issue_date DESC LIMIT ?", (limit,)
        if table == "bill":
            if "overdue" in normalized or "due" in normalized:
                return "SELECT * FROM bill ORDER BY due_date DESC LIMIT ?", (limit,)
            return "SELECT * FROM bill ORDER BY issue_date DESC LIMIT ?", (limit,)
        if table == "banktxn":
            return "SELECT * FROM banktxn ORDER BY date DESC LIMIT ?", (limit,)
        if table == "ledgerentry":
            return "SELECT * FROM ledgerentry ORDER BY date DESC LIMIT ?", (limit,)
        if table == "matchrecord":
            return "SELECT * FROM matchrecord ORDER BY created_at DESC LIMIT ?", (limit,)
        if table == "exceptionrecord":
            return "SELECT * FROM exceptionrecord ORDER BY created_at DESC LIMIT ?", (limit,)
        if table == "reconciliationrun":
            return "SELECT * FROM reconciliationrun ORDER BY created_at DESC LIMIT ?", (limit,)
        raise ValueError(f"Unsupported table '{table}'.")

    def _candidate_tables(self, table: str, record_id: str | None) -> list[str]:
        candidates: list[str] = []
        prefix_table = self._table_from_record_id(record_id) if record_id else None

        for candidate in (prefix_table, table, "exceptionrecord", "matchrecord"):
            if candidate and candidate in ALLOWED_TABLES and candidate not in candidates:
                candidates.append(candidate)

        if not candidates:
            candidates.append(table)

        return candidates

    @staticmethod
    def _table_from_record_id(record_id: str | None) -> str | None:
        if not record_id:
            return None
        prefix = record_id.split("-", 1)[0].upper()
        return {
            "INV": "invoice",
            "BILL": "bill",
            "BANK": "banktxn",
            "TXN": "banktxn",
            "LED": "ledgerentry",
        }.get(prefix)

    @staticmethod
    def _lookup_note(requested_table: str, selected_table: str, record_id: str | None) -> str | None:
        if not record_id:
            return None
        if requested_table == selected_table:
            return None

        readable = {
            "invoice": "invoice",
            "bill": "bill",
            "banktxn": "bank transaction",
            "ledgerentry": "ledger entry",
            "exceptionrecord": "exception record",
            "matchrecord": "match record",
            "reconciliationrun": "reconciliation run",
        }
        return (
            f"Note: {record_id} looks like a {readable.get(selected_table, selected_table)}, "
            f"so I searched that record type instead of the requested {readable.get(requested_table, requested_table)}."
        )

    @staticmethod
    def _row_record_id(row: dict[str, Any]) -> str | None:
        value = row.get("record_id") or row.get("txn_id") or row.get("invoice_id") or row.get("bill_id") or row.get("entry_id") or row.get("id")
        return str(value) if value not in (None, "") else None

    def _run_select(self, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        self._validate_select(query)
        assert self.db_path is not None
        if not self.db_path.exists():
            return []
        conn = sqlite3.connect(f"file:{self.db_path.as_posix()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.execute(query, params)
            rows = [dict(row) for row in cursor.fetchall()][:MAX_ROWS]
            return rows
        finally:
            conn.close()

    @staticmethod
    def _validate_select(query: str) -> None:
        lowered = query.strip().lower()
        if not lowered.startswith("select"):
            raise ValueError("Only SELECT statements are allowed.")
        forbidden = (" insert ", " update ", " delete ", " drop ", " alter ", " pragma ", ";")
        padded = f" {lowered} "
        if any(token in padded for token in forbidden):
            raise ValueError("Unsafe SQL detected.")

    @staticmethod
    def _extract_record_id(question: str) -> str | None:
        match = re.search(r"\b((?:INV|BILL|BANK|LED|TXN)-[A-Z0-9\-]+)\b", question.upper())
        return match.group(1) if match else None

    @staticmethod
    def _infer_table(question: str) -> str | None:
        for key, table in TABLE_ALIASES.items():
            if key in question:
                return table
        return None

    @staticmethod
    def _format_row(row: dict[str, Any]) -> str:
        parts: list[str] = []
        for key in ("invoice_id", "bill_id", "txn_id", "entry_id", "record_id", "status", "amount", "date", "issue_date", "due_date", "customer", "vendor", "description", "memo"):
            value = row.get(key)
            if value not in (None, ""):
                parts.append(f"{key}={ReadOnlySQLTool._stringify(value)}")
        if not parts:
            parts = [", ".join(f"{k}={ReadOnlySQLTool._stringify(v)}" for k, v in list(row.items())[:6])]
        return "; ".join(parts)

    @staticmethod
    def _format_record_block(row: dict[str, Any], index: int) -> str:
        fields: list[tuple[str, Any]] = []
        for key in ("invoice_id", "bill_id", "txn_id", "entry_id", "record_id", "status", "amount", "date", "issue_date", "due_date", "customer", "vendor", "description", "memo"):
            value = row.get(key)
            if value not in (None, ""):
                fields.append((key, value))

        if not fields:
            fields = list(row.items())[:6]

        lines = [f"{index}. " + (f"{key}: {ReadOnlySQLTool._stringify(value)}" if key else ReadOnlySQLTool._stringify(value)) for key, value in fields[:8]]
        return "\n   ".join(lines)

    @staticmethod
    def _stringify(value: Any) -> str:
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)


def create_sql_query_tool(tool: ReadOnlySQLTool | None = None):
    tool = tool or ReadOnlySQLTool()

    def _run(question: str, history: str = "") -> dict[str, Any]:
        response = tool.answer(question, history=history)
        return response.model_dump()

    return _run
