from __future__ import annotations

import json
from typing import Any


SYSTEM_MATCH = (
    "You are an expert financial reconciliation assistant with deep knowledge of "
    "accounting workflows, bank statement processing, and general ledger matching.\n"
    "Your job is to propose matches between unresolved financial records and candidate "
    "counterparts, or to state confidently that no match exists.\n\n"
    "RULES:\n"
    "- Never match records from the same source type.\n"
    "- Never guess above confidence 0.5 unless you can point to concrete evidence.\n"
    "- Evidence includes: amount proximity, date proximity, text/description similarity, "
    "explicit linked IDs, and accounting logic (e.g. bank fees explain small differences).\n"
    "- If amounts differ by exactly a known fee amount (e.g. ₹1-50 for processing fees), "
    "that is a fee-adjusted match, not an amount mismatch.\n"
    "- If one invoice is paid across 2 bank transactions that sum close to the invoice amount, "
    "that is a split payment.\n"
    "- Date offsets of 1-7 days between bank and ledger are normal settlement delays.\n"
    "- If the case is genuinely unclear with multiple plausible candidates, label it 'ambiguous'.\n"
    "- Return only structured JSON matching the provided schema.\n"
)

SYSTEM_EXCEPTION = (
    "You are a senior accountant explaining reconciliation discrepancies to a non-technical "
    "finance manager. Write in plain, clear language.\n"
    "For each exception, provide:\n"
    "1. A clear explanation of what the issue is (what kind of mismatch).\n"
    "2. A specific, actionable next step for the human reviewer.\n"
    "3. Never invent evidence. Only describe what the data shows.\n"
    "Return only structured JSON matching the provided schema.\n"
)

SYSTEM_QA = (
    "You are a grounded finance QA assistant embedded in a reconciliation system.\n"
    "CRITICAL RULES:\n"
    "- Answer ONLY from the provided context chunks. Never use outside knowledge.\n"
    "- Always cite specific record IDs (e.g. BANK-0001, LED-0042, INV-0015) in your answer.\n"
    "- If the context does not contain enough information, say so explicitly: "
    "'I couldn't find matching records for that question — try rephrasing or check the exception list directly.'\n"
    "- Be specific with numbers: amounts, counts, dates.\n"
    "- When discussing exceptions, explain WHY they are exceptions.\n"
    "- When discussing matches, mention the match layer and confidence.\n"
    "- Structure your answer clearly. Use bullet points for lists.\n"
    "Return only structured JSON matching the provided schema.\n"
)


def build_match_batch_prompt(payload: dict[str, Any]) -> str:
    """Build a prompt for the LLM to propose matches for a batch of unresolved records."""
    records_summary = []
    for record in payload.get("unresolved_records", []):
        records_summary.append(
            f"  - {record.get('record_id', '?')}: "
            f"amount={record.get('amount', '?')}, "
            f"date={record.get('date', '?')}, "
            f"text={record.get('text', '?')[:80]}"
        )
    candidates_summary = []
    for cand in payload.get("candidate_pool", []):
        candidates_summary.append(
            f"  - {cand.get('record_id', '?')} [{cand.get('source_type', '?')}]: "
            f"amount={cand.get('amount', '?')}, "
            f"date={cand.get('date', '?')}, "
            f"text={cand.get('text', '?')[:80]}"
        )
    threshold = payload.get("confidence_threshold", 0.75)
    pair_type = payload.get("source_type", "?") + "_to_" + payload.get("target_type", "?")

    lines = [
        SYSTEM_MATCH,
        f"\nPAIR TYPE: {pair_type}",
        f"CONFIDENCE THRESHOLD: {threshold}",
        "\nUNRESOLVED RECORDS:",
        *records_summary,
        "\nCANDIDATE POOL (possible counterparts):",
        *candidates_summary,
        "\nFor EACH unresolved record above, propose your best match from the candidate pool",
        "or state that no confident match exists.",
        "\nConsider:\n"
        "- Amount proximity (within tolerance for fees/rounding)\n"
        "- Date proximity (within 7 days for settlement delays)\n"
        "- Text/description similarity\n"
        "- Whether the candidate is already matched to another record\n",
    ]
    return "\n".join(lines)


def build_exception_explanation_prompt(payload: dict[str, Any]) -> str:
    """Build a prompt for explaining why a record is an exception."""
    record = payload.get("record", {})
    reason = payload.get("reason_category", "unknown")
    best = payload.get("best_candidate")

    lines = [
        SYSTEM_EXCEPTION,
        "\n---",
        f"EXCEPTION RECORD: {json.dumps(record, indent=2, sort_keys=True)}",
        f"REASON CATEGORY: {reason}",
    ]
    if best:
        lines.append(f"BEST CANDIDATE (didn't clear threshold): {json.dumps(best, indent=2)}")

    lines.extend([
        "\nWrite a clear, plain-language explanation answering:",
        "1. WHAT is the mismatch? (e.g. 'This bank transaction of ₹24,500 has no matching ledger entry')",
        "2. WHY did it likely happen? (e.g. 'Bank processing fee not yet recorded in the ledger')",
        "3. WHAT should the reviewer do? (e.g. 'Check if there is a separate journal entry for the fee')",
        "\nReturn structured JSON with 'explanation' and 'suggested_action' fields.",
    ])
    return "\n".join(lines)


def build_qa_prompt(payload: dict[str, Any]) -> str:
    """Build a prompt for the RAG QA agent."""
    question = payload.get("question", "")
    context_chunks = payload.get("context", [])

    context_text = []
    for i, chunk in enumerate(context_chunks):
        meta = chunk.get("metadata", {})
        text = chunk.get("text", "")[:500]
        score = chunk.get("score", 0)
        context_text.append(
            f"[Chunk {i+1}] (relevance: {score:.3f}, source: {meta.get('source_type', '?')}, "
            f"record: {meta.get('record_id', '?')})\n{text}"
        )

    lines = [
        SYSTEM_QA,
        "\n---",
        f"USER QUESTION: {question}",
        "\nRELEVANT CONTEXT FROM RECONCILIATION DATA:",
        "\n".join(context_text) if context_text else "(no relevant context found)",
        "\nAnswer the question using ONLY the context above.",
        "Cite specific record IDs. If the context is insufficient, say so.",
    ]
    return "\n".join(lines)
