from __future__ import annotations

import csv
import json
from io import StringIO

from fastapi.testclient import TestClient

from app.main import app


def test_folder_mode_endpoint_accepts_csv_drop_folder(tmp_path):
    client = TestClient(app)

    bank_statement = [
        {
            "txn_id": "BANK-0001",
            "date": "2026-01-01",
            "amount": -100.0,
            "description": "PMT ACME INV 0001",
            "running_balance": 9900.0,
        }
    ]
    general_ledger = [
        {
            "entry_id": "LED-0001",
            "date": "2026-01-01",
            "account": "Cash",
            "debit_or_credit": "credit",
            "amount": 100.0,
            "memo": "Payment received for ACME reference BANK-0001",
            "linked_txn_id": "",
            "linked_bank_txn_id": "BANK-0001",
            "linked_document_id": "INV-0001",
        }
    ]
    invoices = [
        {
            "invoice_id": "INV-0001",
            "customer": "Acme Inc",
            "amount": 100.0,
            "issue_date": "2025-12-31",
            "due_date": "2026-01-30",
            "status": "paid",
            "linked_ledger_id": "LED-0001",
        }
    ]
    bills = [
        {
            "bill_id": "BILL-0001",
            "vendor": "Stationery Co",
            "amount": 35.0,
            "issue_date": "2026-01-02",
            "due_date": "2026-02-01",
            "status": "open",
            "linked_ledger_id": "",
        }
    ]
    ground_truth = {
        "record_truth": {
            "bank:BANK-0001": {"counterparts": [{"source_type": "ledger", "record_id": "LED-0001"}]},
            "ledger:LED-0001": {
                "counterparts": [
                    {"source_type": "bank", "record_id": "BANK-0001"},
                    {"source_type": "invoice", "record_id": "INV-0001"},
                ]
            },
            "invoice:INV-0001": {"counterparts": [{"source_type": "ledger", "record_id": "LED-0001"}]},
            "bill:BILL-0001": {"counterparts": []},
        }
    }

    def to_csv(rows: list[dict[str, object]]) -> str:
        buffer = StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        return buffer.getvalue()

    input_dir = tmp_path / "drop"
    input_dir.mkdir()
    (input_dir / "bank_statement.csv").write_text(to_csv(bank_statement), encoding="utf-8")
    (input_dir / "general_ledger.csv").write_text(to_csv(general_ledger), encoding="utf-8")
    (input_dir / "invoices.csv").write_text(to_csv(invoices), encoding="utf-8")
    (input_dir / "bills.csv").write_text(to_csv(bills), encoding="utf-8")
    (input_dir / "ground_truth.json").write_text(json.dumps(ground_truth), encoding="utf-8")

    response = client.post("/api/reconcile/run-folder", json={"input_dir": str(input_dir)})

    assert response.status_code == 200
    body = response.json()
    assert body["kpis"]["checksum_ok"] is True
    assert body["kpis"]["scoring_available"] is True
    assert body["accuracy"]["available"] is True
    assert len(body["matches"]) >= 2
    assert len(body["exceptions"]) >= 1
