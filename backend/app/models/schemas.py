from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class BankTxn(SQLModel, table=True):
    txn_id: str = Field(primary_key=True)
    date: date
    amount: float
    description: str
    running_balance: float
    source_type: str = Field(default="bank")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LedgerEntry(SQLModel, table=True):
    entry_id: str = Field(primary_key=True)
    date: date
    account: str
    debit_or_credit: str
    amount: float
    memo: str
    linked_txn_id: Optional[str] = Field(default=None, index=True)
    linked_bank_txn_id: Optional[str] = Field(default=None, index=True)
    linked_document_id: Optional[str] = Field(default=None, index=True)
    source_type: str = Field(default="ledger")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Invoice(SQLModel, table=True):
    invoice_id: str = Field(primary_key=True)
    customer: str
    amount: float
    issue_date: date
    due_date: date
    status: str
    linked_ledger_id: Optional[str] = Field(default=None, index=True)
    source_type: str = Field(default="invoice")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Bill(SQLModel, table=True):
    bill_id: str = Field(primary_key=True)
    vendor: str
    amount: float
    issue_date: date
    due_date: date
    status: str
    linked_ledger_id: Optional[str] = Field(default=None, index=True)
    source_type: str = Field(default="bill")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MatchRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    source_a_type: str
    source_a_id: str = Field(index=True)
    source_b_type: str
    source_b_id: str = Field(index=True)
    match_layer: int
    match_kind: str
    confidence: float
    reasoning: str
    evidence_json: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExceptionRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    source_type: str
    record_id: str = Field(index=True)
    best_candidate_type: Optional[str] = None
    best_candidate_id: Optional[str] = None
    best_candidate_confidence: Optional[float] = None
    reason_category: str
    status: str = Field(default="NEEDS_HUMAN_REVIEW")
    explanation: str
    suggested_action: str
    evidence_json: Optional[str] = Field(default=None)
    review_status: str = Field(default="OPEN")
    review_notes: Optional[str] = Field(default=None)
    reviewed_by: Optional[str] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLogRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: Optional[str] = Field(default=None, index=True)
    record_id: Optional[str] = Field(default=None, index=True)
    action: str
    actor: str = Field(default="Human Auditor")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    comment: Optional[str] = Field(default=None)
    previous_state: Optional[str] = Field(default=None)
    new_state: Optional[str] = Field(default=None)


class ReconciliationRun(SQLModel, table=True):
    id: str = Field(primary_key=True)
    seed: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    total_records: int
    matched_count: int
    exception_count: int
    checksum_ok: bool
    match_rate: float
    precision: float
    recall: float
    f1: float
    cash_position: float
    metrics_json: str

