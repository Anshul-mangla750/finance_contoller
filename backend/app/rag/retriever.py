from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.llm.gemini_client import GeminiClient
from app.rag.store import LocalVectorStore, VectorDocument


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    # Handle dimension mismatch
    min_len = min(len(left), len(right))
    left = left[:min_len]
    right = right[:min_len]
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


def _keyword_boost(question: str, doc: VectorDocument) -> float:
    """Add a small boost for keyword matches in the document text."""
    question_lower = question.lower()
    text_lower = doc.text.lower()
    boost = 0.0

    # Extract keywords from question (skip common words)
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                  "have", "has", "had", "do", "does", "did", "will", "would", "could",
                  "should", "may", "might", "can", "shall", "of", "in", "to", "for",
                  "with", "on", "at", "by", "from", "as", "into", "about", "which",
                  "what", "when", "where", "who", "how", "this", "that", "these",
                  "those", "and", "or", "but", "not", "no", "all", "any", "each"}
    keywords = [w for w in re.split(r'\W+', question_lower) if w and w not in stop_words and len(w) > 2]

    matched_keywords = sum(1 for kw in keywords if kw in text_lower)
    if keywords:
        # Return a 0-1 relevance score: proportion of keywords matched
        boost = matched_keywords / len(keywords) if keywords else 0.0

    # Boost for record ID matches
    record_ids = re.findall(r'[A-Z]+-\d{4}', question.upper())
    for rid in record_ids:
        if rid in doc.text.upper():
            boost += 0.1

    return boost


class Retriever:
    def __init__(self, index_path: Path | None = None):
        self.settings = get_settings()
        self.index_path = index_path or self.settings.generated_dir / "rag_index.json"
        self.client = GeminiClient()
        self.store = LocalVectorStore(self.index_path)

    def retrieve(
        self,
        question: str,
        k: int = 8,
        metadata_filter: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        docs = self.store.read()
        if not docs:
            return []

        # Apply metadata filter
        if metadata_filter:
            docs = [
                doc for doc in docs
                if all(doc.metadata.get(key) == value for key, value in metadata_filter.items())
            ]

        if not docs:
            return []

        # Get query embedding
        query_embedding = self.client.embed_texts([question])[0]

        # Score each document
        scored: list[dict[str, Any]] = []

        # Detect offline/hashed embeddings (8-dim) — cosine similarity is meaningless
        use_keyword_only = (
            not self.client.is_online
            or len(query_embedding) <= 8
            or any(len(doc.embedding) <= 8 for doc in docs)
        )

        for doc in docs:
            if use_keyword_only:
                # Pure keyword-based scoring when embeddings are not real
                keyword_score = _keyword_boost(question, doc)
                # Bonus for metadata kind match
                meta = doc.metadata or {}
                meta_bonus = 0.0
                lowered = question.lower()
                if meta.get("kind") == "exception" and any(w in lowered for w in ["exception", "error", "unmatched", "issue", "wrong"]):
                    meta_bonus = 0.15
                if meta.get("kind") == "match" and any(w in lowered for w in ["match", "reconcil", "pair", "linked"]):
                    meta_bonus = 0.15
                if meta.get("source_type") == "kpi" and any(w in lowered for w in ["summary", "total", "count", "rate", "cash"]):
                    meta_bonus = 0.15
                combined_score = min(1.0, keyword_score + meta_bonus)
            else:
                cosine_score = _cosine(query_embedding, doc.embedding)
                keyword_boost = _keyword_boost(question, doc) * 0.25  # scale down to preserve cosine dominance
                combined_score = min(1.0, cosine_score + keyword_boost)

            scored.append({
                "id": doc.id,
                "text": doc.text,
                "metadata": doc.metadata,
                "score": round(combined_score, 4),
                "record_id": doc.metadata.get("record_id", doc.id),
            })

        # Sort by combined score descending
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:k]
