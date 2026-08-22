from __future__ import annotations

from pathlib import Path
from typing import Any

from app.config import get_settings
from app.llm.gemini_client import GeminiClient
from app.rag.store import LocalVectorStore, VectorDocument


def _record_text(source_type: str, record: dict[str, Any]) -> str:
    parts = [f"source_type: {source_type}"]
    for key, value in record.items():
        parts.append(f"{key}: {value}")
    return "\n".join(parts)


def _match_text(match: dict[str, Any]) -> str:
    return "\n".join(
        [
            "source_type: match",
            *[f"{key}: {value}" for key, value in match.items()],
        ]
    )


def _exception_text(exception: dict[str, Any]) -> str:
    return "\n".join(
        [
            "source_type: exception",
            *[f"{key}: {value}" for key, value in exception.items()],
        ]
    )


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
    for record in bank_records:
        text = _record_text("bank", record)
        docs.append(VectorDocument(id=f"bank:{record['txn_id']}", text=text, embedding=[], metadata={"source_type": "bank", "record_id": record["txn_id"], "kind": "record"}))
    for record in ledger_records:
        text = _record_text("ledger", record)
        docs.append(VectorDocument(id=f"ledger:{record['entry_id']}", text=text, embedding=[], metadata={"source_type": "ledger", "record_id": record["entry_id"], "kind": "record"}))
    for record in invoices:
        text = _record_text("invoice", record)
        docs.append(VectorDocument(id=f"invoice:{record['invoice_id']}", text=text, embedding=[], metadata={"source_type": "invoice", "record_id": record["invoice_id"], "kind": "record"}))
    for record in bills:
        text = _record_text("bill", record)
        docs.append(VectorDocument(id=f"bill:{record['bill_id']}", text=text, embedding=[], metadata={"source_type": "bill", "record_id": record["bill_id"], "kind": "record"}))
    for match in matches:
        text = _match_text(match)
        docs.append(VectorDocument(id=f"match:{match['pair_type']}:{match['source_a_id']}->{match['source_b_id']}", text=text, embedding=[], metadata={"source_type": "match", "record_id": f"{match['source_a_id']}->{match['source_b_id']}", "kind": "match", "pair_type": match["pair_type"]}))
    for exception in exceptions:
        text = _exception_text(exception)
        docs.append(VectorDocument(id=f"exception:{exception['source_type']}:{exception['record_id']}", text=text, embedding=[], metadata={"source_type": "exception", "record_id": exception["record_id"], "kind": "exception"}))

    embeddings = client.embed_texts([doc.text for doc in docs])
    for doc, embedding in zip(docs, embeddings, strict=True):
        doc.embedding = embedding

    store = LocalVectorStore(out_path)
    store.write(docs)
    return out_path

