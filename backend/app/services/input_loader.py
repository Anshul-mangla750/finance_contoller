from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path
from typing import Any

from app.config import REPO_ROOT
from app.data_gen.generator import GeneratedBundle


DATASET_STEMS = {
    "bank_statement": "bank_statement",
    "general_ledger": "general_ledger",
    "invoices": "invoices",
    "bills": "bills",
}

ALLOWED_DATASET_SUFFIXES = (".json", ".csv")


def _clean_value(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: _clean_value(value) for key, value in record.items()}


def _load_json_records(raw: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Invalid JSON in {filename}: {exc}") from exc
    if not isinstance(payload, list):
        raise ValueError(f"{filename} must contain a JSON array of records.")
    if not all(isinstance(item, dict) for item in payload):
        raise ValueError(f"{filename} must contain objects only.")
    return [normalize_record(item) for item in payload]


def _load_csv_records(raw: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        text = raw.decode("utf-8-sig")
    except Exception as exc:
        raise ValueError(f"Invalid CSV encoding in {filename}: {exc}") from exc
    try:
        reader = csv.DictReader(StringIO(text))
        rows = [normalize_record(dict(row)) for row in reader]
    except Exception as exc:
        raise ValueError(f"Invalid CSV in {filename}: {exc}") from exc
    if not rows:
        raise ValueError(f"{filename} did not contain any rows.")
    return rows


def load_records_from_bytes(raw: bytes, filename: str) -> list[dict[str, Any]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        return _load_csv_records(raw, filename)
    if suffix == ".json" or suffix == "":
        return _load_json_records(raw, filename)
    raise ValueError(f"{filename} must be a .json or .csv file.")


def load_ground_truth_from_bytes(raw: bytes, filename: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ValueError(f"Invalid JSON in {filename}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("ground_truth.json must contain a JSON object.")
    return payload


def _resolve_dataset_file(input_dir: Path, stem: str) -> Path:
    for suffix in ALLOWED_DATASET_SUFFIXES:
        candidate = input_dir / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    available = ", ".join(f"{stem}{suffix}" for suffix in ALLOWED_DATASET_SUFFIXES)
    raise FileNotFoundError(f"Missing required dataset file for {stem}. Expected one of: {available}")


def _read_records(path: Path) -> list[dict[str, Any]]:
    return load_records_from_bytes(path.read_bytes(), path.name)


def load_bundle_from_directory(input_dir: str | Path | None) -> tuple[GeneratedBundle, dict[str, Any] | None]:
    candidate_dir = Path(input_dir) if input_dir is not None else REPO_ROOT / "input"
    if not candidate_dir.is_absolute():
        candidate_dir = (REPO_ROOT / candidate_dir).resolve()
    input_dir_path = candidate_dir
    if not input_dir_path.exists():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir_path}")

    bank_statement = _read_records(_resolve_dataset_file(input_dir_path, "bank_statement"))
    general_ledger = _read_records(_resolve_dataset_file(input_dir_path, "general_ledger"))
    invoices = _read_records(_resolve_dataset_file(input_dir_path, "invoices"))
    bills = _read_records(_resolve_dataset_file(input_dir_path, "bills"))

    ground_truth_path = input_dir_path / "ground_truth.json"
    ground_truth: dict[str, Any] | None = None
    if ground_truth_path.exists():
        ground_truth = load_ground_truth_from_bytes(ground_truth_path.read_bytes(), ground_truth_path.name)

    return (
        GeneratedBundle(
            bank_statement=bank_statement,
            general_ledger=general_ledger,
            invoices=invoices,
            bills=bills,
            ground_truth=ground_truth or {},
        ),
        ground_truth,
    )
