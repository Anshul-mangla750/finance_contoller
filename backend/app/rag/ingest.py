from __future__ import annotations

from pathlib import Path
from typing import Any

from app.config import get_settings
from app.llm.gemini_client import GeminiClient
from app.rag.store import LocalVectorStore, VectorDocument


def _record_text(source_type: str, record: dict[str, Any]) -> str:
    """Build a rich text representation of a source record for embedding."""
    parts = [f"Source: {source_type}"]
    id_key = {"bank": "txn_id", "ledger": "entry_id", "invoice": "invoice_id", "bill": "bill_id"}.get(source_type, "id")
    record_id = record.get(id_key, "unknown")
    parts.append(f"Record ID: {record_id}")

    if source_type == "bank":
        parts.append(f"Date: {record.get('date', 'N/A')}")
        parts.append(f"Amount: {record.get('amount', 0):.2f}")
        parts.append(f"Description: {record.get('description', 'N/A')}")
        parts.append(f"Running Balance: {record.get('running_balance', 0):.2f}")
    elif source_type == "ledger":
        parts.append(f"Date: {record.get('date', 'N/A')}")
        parts.append(f"Account: {record.get('account', 'N/A')}")
        parts.append(f"Amount: {record.get('amount', 0):.2f} ({record.get('debit_or_credit', 'N/A')})")
        parts.append(f"Memo: {record.get('memo', 'N/A')}")
        linked = record.get("linked_bank_txn_id") or record.get("linked_document_id")
        if linked:
            parts.append(f"Linked to: {linked}")
    elif source_type == "invoice":
        parts.append(f"Customer: {record.get('customer', 'N/A')}")
        parts.append(f"Amount: {record.get('amount', 0):.2f}")
        parts.append(f"Issue Date: {record.get('issue_date', 'N/A')}")
        parts.append(f"Due Date: {record.get('due_date', 'N/A')}")
        parts.append(f"Status: {record.get('status', 'N/A')}")
    elif source_type == "bill":
        parts.append(f"Vendor: {record.get('vendor', 'N/A')}")
        parts.append(f"Amount: {record.get('amount', 0):.2f}")
        parts.append(f"Issue Date: {record.get('issue_date', 'N/A')}")
        parts.append(f"Due Date: {record.get('due_date', 'N/A')}")
        parts.append(f"Status: {record.get('status', 'N/A')}")
    return "\n".join(parts)


def _match_text(match: dict[str, Any]) -> str:
    """Build a rich text representation of a match record."""
    parts = [
        "Source: match",
        f"Match: {match.get('source_a_type', '?')}:{match.get('source_a_id', '?')} "
        f"<-> {match.get('source_b_type', '?')}:{match.get('source_b_id', '?')}",
        f"Pair type: {match.get('pair_type', 'N/A')}",
        f"Match layer: {match.get('match_layer', 'N/A')}",
        f"Match kind: {match.get('match_kind', 'N/A')}",
        f"Confidence: {match.get('confidence', 0):.1%}",
        f"Reasoning: {match.get('reasoning', 'N/A')}",
    ]
    return "\n".join(parts)


def _exception_text(exception: dict[str, Any]) -> str:
    """Build a rich text representation of an exception record."""
    parts = [
        "Source: exception",
        f"Record: {exception.get('source_type', '?')}:{exception.get('record_id', '?')}",
        f"Reason: {exception.get('reason_category', 'N/A')}",
        f"Status: {exception.get('status', 'N/A')}",
        f"Explanation: {exception.get('explanation', 'N/A')}",
        f"Suggested action: {exception.get('suggested_action', 'N/A')}",
    ]
    if exception.get("best_candidate_id"):
        conf = exception.get("best_candidate_confidence")
        parts.append(
            f"Best candidate: {exception.get('best_candidate_type', '?')}:{exception.get('best_candidate_id', '?')}"
            + (f" ({conf*100:.0f}% confidence)" if conf else "")
        )
    return "\n".join(parts)


def ingest_reconciliation_state(
    bank_records: list[dict[str, Any]],
    ledger_records: list[dict[str, Any]],
    invoices: list[dict[str, Any]],
    bills: list[dict[str, Any]],
    matches: list[dict[str, Any]],
    exceptions: list[dict[str, Any]],
    out_path: Path | None = None,
) -> Path:
    settings = get_settings()
    out_path = out_path or settings.generated_dir / "rag_index.json"
    client = GeminiClient()

    docs: list[VectorDocument] = []

    # Source records
    for record in bank_records:
        text = _record_text("bank", record)
        docs.append(VectorDocument(
            id=f"bank:{record['txn_id']}",
            text=text,
            embedding=[],
            metadata={"source_type": "bank", "record_id": record["txn_id"], "kind": "record", "date": record.get("date", ""), "amount": float(record.get("amount", 0))},
        ))
    for record in ledger_records:
        text = _record_text("ledger", record)
        docs.append(VectorDocument(
            id=f"ledger:{record['entry_id']}",
            text=text,
            embedding=[],
            metadata={"source_type": "ledger", "record_id": record["entry_id"], "kind": "record", "date": record.get("date", ""), "amount": float(record.get("amount", 0))},
        ))
    for record in invoices:
        text = _record_text("invoice", record)
        docs.append(VectorDocument(
            id=f"invoice:{record['invoice_id']}",
            text=text,
            embedding=[],
            metadata={"source_type": "invoice", "record_id": record["invoice_id"], "kind": "record", "status": record.get("status", ""), "amount": float(record.get("amount", 0))},
        ))
    for record in bills:
        text = _record_text("bill", record)
        docs.append(VectorDocument(
            id=f"bill:{record['bill_id']}",
            text=text,
            embedding=[],
            metadata={"source_type": "bill", "record_id": record["bill_id"], "kind": "record", "status": record.get("status", ""), "amount": float(record.get("amount", 0))},
        ))

    # Match records
    for match in matches:
        text = _match_text(match)
        docs.append(VectorDocument(
            id=f"match:{match['pair_type']}:{match['source_a_id']}->{match['source_b_id']}",
            text=text,
            embedding=[],
            metadata={
                "source_type": "match",
                "record_id": f"{match['source_a_id']}->{match['source_b_id']}",
                "kind": "match",
                "pair_type": match["pair_type"],
                "confidence": float(match.get("confidence", 0)),
                "match_layer": int(match.get("match_layer", 0)),
            },
        ))

    # Exception records
    for exception in exceptions:
        text = _exception_text(exception)
        docs.append(VectorDocument(
            id=f"exception:{exception['source_type']}:{exception['record_id']}",
            text=text,
            embedding=[],
            metadata={
                "source_type": "exception",
                "record_id": exception["record_id"],
                "kind": "exception",
                "reason_category": exception.get("reason_category", ""),
                "status": exception.get("status", ""),
            },
        ))

    # KPI summary document
    total_bank = len(bank_records)
    total_ledger = len(ledger_records)
    total_invoices = len(invoices)
    total_bills = len(bills)
    total_matched = len(matches)
    total_exceptions = len(exceptions)
    kpi_text = (
        f"Source: kpi_summary\n"
        f"Reconciliation Summary:\n"
        f"Total bank transactions: {total_bank}\n"
        f"Total ledger entries: {total_ledger}\n"
        f"Total invoices: {total_invoices}\n"
        f"Total bills: {total_bills}\n"
        f"Total matches: {total_matched}\n"
        f"Total exceptions: {total_exceptions}\n"
        f"Match rate: {total_matched / (total_matched + total_exceptions) * 100:.1f}%\n"
    )
    docs.append(VectorDocument(
        id="kpi:summary",
        text=kpi_text,
        embedding=[],
        metadata={"source_type": "kpi", "record_id": "summary", "kind": "kpi"},
    ))

    # Generate embeddings
    texts = [doc.text for doc in docs]
    embeddings = client.embed_texts(texts)
    for doc, embedding in zip(docs, embeddings, strict=True):
        doc.embedding = embedding

    store = LocalVectorStore(out_path)
    store.write(docs)
    return out_path
