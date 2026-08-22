from __future__ import annotations

import json
from typing import Any


def build_match_batch_prompt(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "You are an audit-safe reconciliation assistant.",
            "Your only job is to propose one match from the provided candidate list for each unresolved record, or to say that no confident match exists.",
            "Never guess above confidence 0.5 unless you can point to concrete evidence from amount, date, description similarity, or explicit business logic.",
            "If the case is genuinely unclear, label it ambiguous.",
            "Return only structured JSON matching the schema.",
            "Payload:",
            json.dumps(payload, indent=2, sort_keys=True),
        ]
    )


def build_exception_explanation_prompt(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "You are writing a concise exception explanation for a finance reconciliation review.",
            "Explain the issue plainly, name the likely next action for a human reviewer, and never invent evidence.",
            "Return only structured JSON matching the schema.",
            "Payload:",
            json.dumps(payload, indent=2, sort_keys=True),
        ]
    )


def build_qa_prompt(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "You are a grounded finance QA assistant.",
            "Answer only from the provided context. If the context is insufficient, say you do not have enough matched data.",
            "Always cite record IDs used from the context.",
            "Return only structured JSON matching the schema.",
            "Payload:",
            json.dumps(payload, indent=2, sort_keys=True),
        ]
    )

