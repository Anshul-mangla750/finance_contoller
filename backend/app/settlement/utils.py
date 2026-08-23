from __future__ import annotations

import csv
import re
import unicodedata
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def canonicalize_text(value: str | None) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def normalize_currency(value: Any) -> str | None:
    if value is None:
        return None
    text = canonicalize_text(str(value)).upper()
    if not text:
        return None
    if len(text) >= 3:
        return text[:3]
    return text


def format_inr_amount(value: float) -> str:
    amount = abs(round(float(value), 2))
    whole, fraction = f"{amount:.2f}".split(".")
    if len(whole) <= 3:
        formatted_whole = whole
    else:
        last_three = whole[-3:]
        prefix = whole[:-3]
        groups: list[str] = []
        while len(prefix) > 2:
            groups.insert(0, prefix[-2:])
            prefix = prefix[:-2]
        if prefix:
            groups.insert(0, prefix)
        formatted_whole = ",".join(groups + [last_three])
    sign = "-" if value < 0 else ""
    return f"{sign}₹{formatted_whole}.{fraction}"


def parse_amount(value: Any) -> float:
    if value is None:
        raise ValueError("amount value is missing")
    text = str(value).strip()
    if not text:
        raise ValueError("amount value is empty")
    negative = text.startswith("(") and text.endswith(")")
    text = text.replace("(", "").replace(")", "")
    text = text.replace(",", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text.count("-") > 1:
        raise ValueError(f"invalid amount value: {value!r}")
    amount = float(text)
    if negative:
        amount = -abs(amount)
    return round(amount, 2)


def parse_date_value(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value is None:
        raise ValueError("date value is missing")
    text = str(value).strip()
    if not text:
        raise ValueError("date value is empty")

    candidates = (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
    )
    for fmt in candidates:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text).date()
    except ValueError as exc:
        raise ValueError(f"could not parse date value {value!r}") from exc


def token_similarity(left: str | None, right: str | None) -> float:
    if not left or not right:
        return 0.0
    left_tokens = {token for token in canonicalize_text(left).split("_") if token}
    right_tokens = {token for token in canonicalize_text(right).split("_") if token}
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def compact_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def column_index_to_name(index: int) -> str:
    name = ""
    current = index + 1
    while current:
        current, remainder = divmod(current - 1, 26)
        name = chr(65 + remainder) + name
    return name


def read_csv_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def _read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        payload = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(payload)
    values: list[str] = []
    for item in root.findall(f"{NS}si"):
        text_fragments: list[str] = []
        for node in item.iter():
            if node.tag == f"{NS}t" and node.text is not None:
                text_fragments.append(node.text)
        values.append("".join(text_fragments))
    return values


def read_xlsx_rows(path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = _read_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        sheets = workbook.find(f"{NS}sheets")
        if sheets is None or not list(sheets):
            raise ValueError(f"{path.name} does not contain any worksheets")
        first_sheet = list(sheets)[0]
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        target = None
        for rel in rels:
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target")
                break
        if not target:
            target = "worksheets/sheet1.xml"
        sheet_path = f"xl/{target}" if not target.startswith("xl/") else target
        root = ET.fromstring(zf.read(sheet_path))
        sheet_data = root.find(f"{NS}sheetData")
        if sheet_data is None:
            raise ValueError(f"{path.name} does not contain readable sheet data")

        rows: list[list[Any]] = []
        for row in sheet_data.findall(f"{NS}row"):
            values: list[Any] = []
            for cell in row.findall(f"{NS}c"):
                ref = cell.attrib.get("r", "")
                col_letters = "".join(ch for ch in ref if ch.isalpha())
                col_index = 0
                for char in col_letters:
                    col_index = col_index * 26 + (ord(char.upper()) - 64)
                col_index -= 1
                while len(values) <= col_index:
                    values.append("")
                cell_type = cell.attrib.get("t")
                raw_value = cell.findtext(f"{NS}v") or ""
                if cell_type == "s":
                    try:
                        values[col_index] = shared_strings[int(raw_value)]
                    except Exception:
                        values[col_index] = raw_value
                elif cell_type == "inlineStr":
                    values[col_index] = "".join(
                        node.text or "" for node in cell.iter() if node.tag == f"{NS}t"
                    )
                else:
                    values[col_index] = raw_value
            rows.append(values)

        if not rows:
            return []
        headers = [compact_text(value) for value in rows[0]]
        records: list[dict[str, Any]] = []
        for row in rows[1:]:
            record: dict[str, Any] = {}
            for index, header in enumerate(headers):
                if not header:
                    continue
                record[header] = row[index] if index < len(row) else ""
            if any(str(value).strip() for value in record.values()):
                records.append(record)
        return records


def read_tabular_rows(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return read_csv_rows(path)
    if suffix in {".xlsx", ".xlsm"}:
        return read_xlsx_rows(path)
    raise ValueError(f"Unsupported tabular file type: {path.name}")


def write_csv_rows(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def safe_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y", "t"}
