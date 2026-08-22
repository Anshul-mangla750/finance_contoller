from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class VectorDocument:
    id: str
    text: str
    embedding: list[float]
    metadata: dict[str, Any]


class LocalVectorStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def read(self) -> list[VectorDocument]:
        if not self.path.exists():
            return []
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        return [VectorDocument(**item) for item in payload.get("documents", [])]

    def write(self, documents: list[VectorDocument]) -> None:
        payload = {"documents": [document.__dict__ for document in documents]}
        self.path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

