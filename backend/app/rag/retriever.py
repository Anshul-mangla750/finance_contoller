from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.llm.gemini_client import GeminiClient
from app.rag.store import LocalVectorStore, VectorDocument


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


class Retriever:
    def __init__(self, index_path: Path | None = None):
        self.settings = get_settings()
        self.index_path = index_path or self.settings.generated_dir / "rag_index.json"
        self.client = GeminiClient()
        self.store = LocalVectorStore(self.index_path)

    def retrieve(self, question: str, k: int = 8, metadata_filter: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        docs = self.store.read()
        if not docs:
            return []
        if metadata_filter:
            docs = [doc for doc in docs if all(doc.metadata.get(key) == value for key, value in metadata_filter.items())]
        query_embedding = self.client.embed_texts([question])[0]
        scored = [
            {
                "id": doc.id,
                "text": doc.text,
                "metadata": doc.metadata,
                "score": round(_cosine(query_embedding, doc.embedding), 4),
                "record_id": doc.metadata.get("record_id", doc.id),
            }
            for doc in docs
        ]
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:k]

