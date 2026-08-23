from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from app.settlement.utils import canonicalize_text, compact_text, normalize_currency, parse_amount, parse_date_value, read_tabular_rows, safe_bool


ROLE_FIELDS = {
    "settlement": {
        "required": ["record_id", "gross_amount", "fee_amount", "net_amount", "payout_date", "currency"],
        "optional": ["description", "reference_number"],
    },
    "bank": {
        "required": ["record_id", "amount", "statement_date", "description"],
        "optional": ["reference_number", "currency"],
    },
    "order": {
        "required": ["record_id", "amount", "order_date", "customer_id", "status"],
        "optional": ["reference_number", "description"],
    },
}


FIELD_ALIASES = {
    "settlement": {
        "record_id": {"payout_ref", "payout_reference", "settlement_ref", "settlement_reference", "transaction_id", "transaction_ref", "reference_number"},
        "gross_amount": {"gross", "gross_total", "gross_amount", "gross_amt", "payout_gross", "settlement_gross"},
        "fee_amount": {"fee", "fee_amount", "processing_fee", "service_fee", "processor_fee"},
        "net_amount": {"net", "net_amount", "payout_net", "settlement_net", "net_settlement"},
        "payout_date": {"payout_dt", "payout_date", "settlement_date", "posted_date", "date"},
        "currency": {"curr_code", "currency", "currency_code", "ccy"},
        "description": {"note", "description", "memo", "remarks", "narrative"},
        "reference_number": {"bank_reference", "ref_no", "reference", "reference_number", "payment_reference"},
    },
    "bank": {
        "record_id": {"bank_txn_id", "transaction_id", "txn_id", "deposit_id", "entry_id", "reference_number"},
        "amount": {"deposit_amt", "amount", "posted_amount", "deposit_amount", "value"},
        "statement_date": {"posted_on", "statement_date", "date", "posting_date", "value_date"},
        "description": {"memo", "description", "narrative", "details", "reference_memo"},
        "reference_number": {"ref_no", "reference", "reference_number", "bank_reference", "external_reference"},
        "currency": {"currency", "currency_code", "curr_code", "ccy"},
    },
    "order": {
        "record_id": {"order_id", "order_no", "transaction_id", "reference_number"},
        "amount": {"order_total", "amount", "order_amount", "total", "gross"},
        "order_date": {"ordered_at", "order_date", "date", "created_at", "invoice_date"},
        "customer_id": {"customer_id", "customer_code", "customer", "client_id", "buyer_id"},
        "status": {"status", "status_flag", "order_status", "state"},
        "description": {"memo", "description", "narrative", "notes"},
        "reference_number": {"ref_no", "reference", "reference_number", "order_reference", "external_reference"},
    },
}


@dataclass
class LoadedBundle:
    settlement_report: list[dict[str, Any]]
    bank_statement: list[dict[str, Any]]
    order_ledger: list[dict[str, Any]]
    ground_truth: list[dict[str, Any]]
    source_paths: dict[str, Path]


def _header_candidates(headers: Iterable[str]) -> dict[str, str]:
    return {canonicalize_text(header): header for header in headers if header}


def _value_type_ratios(values: list[Any]) -> dict[str, float]:
    dates = 0
    numbers = 0
    texts = 0
    total = 0
    for value in values:
        if value is None or str(value).strip() == "":
            continue
        total += 1
        try:
            parse_date_value(value)
        except Exception:
            pass
        else:
            dates += 1
            continue
        try:
            parse_amount(value)
        except Exception:
            texts += 1
        else:
            numbers += 1
    if total == 0:
        return {"date": 0.0, "number": 0.0, "text": 0.0}
    return {
        "date": dates / total,
        "number": numbers / total,
        "text": texts / total,
    }


def _candidate_score(header: str, canonical_field: str, role: str, sample_values: list[Any]) -> float:
    header_tokens = canonicalize_text(header)
    aliases = FIELD_ALIASES[role][canonical_field]
    score = 0.0
    if header_tokens in aliases:
        score += 100.0
    elif any(alias in header_tokens or header_tokens in alias for alias in aliases):
        score += 70.0
    elif canonical_field in header_tokens:
        score += 55.0
    ratios = _value_type_ratios(sample_values)
    if canonical_field in {"gross_amount", "fee_amount", "net_amount", "amount"}:
        score += ratios["number"] * 20.0
    if canonical_field in {"payout_date", "statement_date", "order_date"}:
        score += ratios["date"] * 20.0
    if canonical_field in {"description", "status", "customer_id", "reference_number", "record_id", "currency"}:
        score += ratios["text"] * 10.0
    if canonical_field in {"currency"} and any(normalize_currency(value) for value in sample_values if value):
        score += 10.0
    return score


def _select_role(rows: list[dict[str, Any]], headers: list[str]) -> tuple[str, dict[str, str]]:
    sample_values_by_header = {
        header: [row.get(header) for row in rows[: min(8, len(rows))]]
        for header in headers
    }
    best_role = ""
    best_score = float("-inf")
    best_mapping: dict[str, str] = {}
    for role in ROLE_FIELDS:
        mapping: dict[str, str] = {}
        used_headers: set[str] = set()
        score = 0.0
        for field in ROLE_FIELDS[role]["required"] + ROLE_FIELDS[role]["optional"]:
            candidates = []
            for header in headers:
                if header in used_headers:
                    continue
                candidates.append((header, _candidate_score(header, field, role, sample_values_by_header.get(header, []))))
            if not candidates:
                continue
            header, field_score = max(candidates, key=lambda item: item[1])
            if field_score >= 45.0:
                mapping[field] = header
                used_headers.add(header)
                score += field_score
        if all(field in mapping for field in ROLE_FIELDS[role]["required"]):
            score += 50.0
        if score > best_score:
            best_score = score
            best_role = role
            best_mapping = mapping
    if not best_role or best_score < 180.0:
        raise ValueError("Could not infer the source role from headers and data types.")
    return best_role, best_mapping


def _normalize_record(role: str, mapping: dict[str, str], row: dict[str, Any]) -> dict[str, Any]:
    def value(field: str) -> Any:
        header = mapping.get(field)
        return row.get(header) if header else None

    record: dict[str, Any] = {"source_role": role}
    record["record_id"] = compact_text(value("record_id"))
    if not record["record_id"]:
        raise ValueError(f"Missing required record identifier for {role}.")

    if role == "settlement":
        record["gross_amount"] = abs(parse_amount(value("gross_amount")))
        fee = parse_amount(value("fee_amount"))
        record["fee_amount"] = abs(fee)
        record["net_amount"] = abs(parse_amount(value("net_amount")))
        record["payout_date"] = parse_date_value(value("payout_date"))
        record["currency"] = normalize_currency(value("currency"))
        record["description"] = compact_text(value("description"))
        record["reference_number"] = compact_text(value("reference_number")) or None
    elif role == "bank":
        record["amount"] = parse_amount(value("amount"))
        record["signed_amount"] = record["amount"]
        record["normalized_amount"] = abs(record["amount"])
        record["statement_date"] = parse_date_value(value("statement_date"))
        record["description"] = compact_text(value("description"))
        record["reference_number"] = compact_text(value("reference_number")) or None
        record["currency"] = normalize_currency(value("currency"))
    elif role == "order":
        record["amount"] = abs(parse_amount(value("amount")))
        record["normalized_amount"] = record["amount"]
        record["order_date"] = parse_date_value(value("order_date"))
        record["customer_id"] = compact_text(value("customer_id"))
        record["status"] = compact_text(value("status"))
        record["description"] = compact_text(value("description"))
        record["reference_number"] = compact_text(value("reference_number")) or None
    else:
        raise ValueError(f"Unsupported role: {role}")

    record["raw"] = dict(row)
    return record


def _infer_and_normalize(rows: list[dict[str, Any]], source_name: str) -> list[dict[str, Any]]:
    if not rows:
        raise ValueError(f"{source_name} did not contain any rows.")
    headers = [header for header in rows[0].keys() if header]
    role, mapping = _select_role(rows, headers)
    normalized: list[dict[str, Any]] = []
    missing_required = [field for field in ROLE_FIELDS[role]["required"] if field not in mapping]
    if missing_required:
        raise ValueError(f"Missing required fields for {role}: {', '.join(missing_required)}")
    for row in rows:
        normalized.append(_normalize_record(role, mapping, row))
    return normalized


def _read_ground_truth(path: Path) -> list[dict[str, Any]]:
    rows = read_tabular_rows(path)
    truth_rows: list[dict[str, Any]] = []
    for row in rows:
        truth_rows.append(
            {
                "source_role": compact_text(row.get("source_role")),
                "record_id": compact_text(row.get("record_id")),
                "matched_source_role": compact_text(row.get("matched_source_role")),
                "matched_record_ids": compact_text(row.get("matched_record_ids")),
                "case_type": compact_text(row.get("case_type")),
                "is_true_orphan": safe_bool(row.get("is_true_orphan")),
                "group_id": compact_text(row.get("group_id")),
            }
        )
    return truth_rows


def load_reconciliation_bundle(paths: Iterable[str | Path]) -> LoadedBundle:
    input_paths = [Path(path) for path in paths]
    if not input_paths:
        raise ValueError("At least one input file is required.")

    truth_rows: list[dict[str, Any]] = []
    if len(input_paths) == 1 and input_paths[0].is_dir():
        input_dir = input_paths[0]
        candidates = sorted(
            [path for path in input_dir.iterdir() if path.suffix.lower() in {".csv", ".xlsx", ".xlsm"}]
        )
        truth_path = next((path for path in candidates if canonicalize_text(path.stem) == "ground_truth"), None)
        if truth_path is None:
            for suffix in (".csv", ".xlsx", ".xlsm"):
                candidate = input_dir / f"ground_truth{suffix}"
                if candidate.exists():
                    truth_path = candidate
                    break
        input_paths = [path for path in candidates if truth_path is None or path != truth_path]
        if truth_path and truth_path.exists():
            truth_rows = _read_ground_truth(truth_path)
    else:
        if len({path.resolve().parent for path in input_paths}) == 1:
            parent = input_paths[0].resolve().parent
            truth_path = None
            for suffix in (".csv", ".xlsx", ".xlsm"):
                candidate = parent / f"ground_truth{suffix}"
                if candidate.exists():
                    truth_path = candidate
                    break
            if truth_path:
                truth_rows = _read_ground_truth(truth_path)

    if len(input_paths) < 3:
        raise ValueError("Expected three source files: settlement, bank, and order.")

    normalized_sources: dict[str, list[dict[str, Any]]] = {}
    source_paths: dict[str, Path] = {}
    seen_roles: set[str] = set()
    for path in input_paths:
        rows = read_tabular_rows(path)
        normalized = _infer_and_normalize(rows, path.name)
        role = normalized[0]["source_role"]
        if role in seen_roles:
            raise ValueError(f"Duplicate source role detected: {role}")
        seen_roles.add(role)
        normalized_sources[role] = normalized
        source_paths[role] = path

    required_roles = {"settlement", "bank", "order"}
    missing_roles = sorted(required_roles - set(normalized_sources))
    if missing_roles:
        raise ValueError(f"Missing required source roles: {', '.join(missing_roles)}")

    return LoadedBundle(
        settlement_report=normalized_sources["settlement"],
        bank_statement=normalized_sources["bank"],
        order_ledger=normalized_sources["order"],
        ground_truth=truth_rows,
        source_paths=source_paths,
    )
