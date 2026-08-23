from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from faker import Faker

from app.config import get_settings


@dataclass
class GeneratedBundle:
    bank_statement: list[dict[str, Any]]
    general_ledger: list[dict[str, Any]]
    invoices: list[dict[str, Any]]
    bills: list[dict[str, Any]]
    ground_truth: dict[str, Any]


def _money(value: float) -> float:
    return round(value + 1e-9, 2)


def _signed(value: float, direction: str) -> float:
    amount = _money(abs(value))
    return -amount if direction == "out" else amount


def _abbrev(text: str) -> str:
    parts = [
        token[:4].upper()
        for token in text.replace("&", " ").replace("-", " ").split()
        if token
    ]
    return " ".join(parts[:6])


def _running_balances(records: list[dict[str, Any]], start_balance: float = 10_000.0) -> None:
    balance = start_balance
    for record in sorted(records, key=lambda item: (item["date"], item["txn_id"])):
        balance += record["amount"]
        record["running_balance"] = _money(balance)


def _record_truth_entry(category: str, source_type: str, record_id: str, counterparts: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "category": category,
        "source_type": source_type,
        "record_id": record_id,
        "counterparts": counterparts,
    }


def _case_entry(
    case_id: str,
    category: str,
    pair_type: str,
    source_a_type: str,
    source_a_ids: list[str],
    source_b_type: str | None,
    source_b_ids: list[str],
) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "category": category,
        "pair_type": pair_type,
        "source_a_type": source_a_type,
        "source_a_ids": source_a_ids,
        "source_b_type": source_b_type,
        "source_b_ids": source_b_ids,
    }


def _make_description(kind: str, customer_or_vendor: str, invoice_id: str) -> str:
    if kind == "clean_match":
        return f"PMT {customer_or_vendor} INV {invoice_id[-4:]}"
    if kind == "fee_mismatch":
        return f"ACH {customer_or_vendor} INV {invoice_id[-4:]} FEE"
    if kind == "date_shift":
        return f"WIRE {customer_or_vendor} {invoice_id[-4:]}"
    if kind == "fuzzy_desc":
        return f"{customer_or_vendor} settlement {invoice_id[-4:]}"
    if kind == "split_payment":
        return f"PARTIAL {customer_or_vendor} {invoice_id[-4:]}"
    if kind == "orphan_bank":
        return f"BANK {customer_or_vendor} CHG"
    if kind == "ambiguous":
        return f"PAY {customer_or_vendor} {invoice_id[-4:]}"
    return f"{customer_or_vendor} {invoice_id[-4:]}"


def _make_memo(kind: str, counterparty_name: str, reference_id: str) -> str:
    if kind == "clean_match":
        return f"Payment received for {counterparty_name} reference {reference_id}"
    if kind == "fee_mismatch":
        return f"Payment posted with fee adjustment for {counterparty_name}"
    if kind == "date_shift":
        return f"Cleared after settlement lag for {counterparty_name}"
    if kind == "fuzzy_desc":
        return f"Settlement receipt from {counterparty_name}"
    if kind == "split_payment":
        return f"Split settlement for {counterparty_name} invoice {reference_id}"
    if kind == "duplicate":
        return f"Duplicate journal entry for {counterparty_name} invoice {reference_id}"
    if kind == "orphan_ledger":
        return f"Issued check awaiting clearance for {counterparty_name}"
    if kind == "ambiguous":
        return f"Unclear memo for {counterparty_name} reference {reference_id}"
    return f"General ledger memo for {counterparty_name}"


def generate_bundle(seed: int | None = None) -> GeneratedBundle:
    settings = get_settings()
    seed = seed if seed is not None else settings.seed
    random.seed(seed)
    faker = Faker()
    faker.seed_instance(seed)

    base_date = date(2026, 6, 1)

    bank_records: list[dict[str, Any]] = []
    ledger_records: list[dict[str, Any]] = []
    invoices: list[dict[str, Any]] = []
    bills: list[dict[str, Any]] = []
    cases: list[dict[str, Any]] = []
    record_truth: dict[str, Any] = {}

    bank_seq = 1
    ledger_seq = 1
    invoice_seq = 1
    bill_seq = 1

    def next_bank_id() -> str:
        nonlocal bank_seq
        value = f"BANK-{bank_seq:04d}"
        bank_seq += 1
        return value

    def next_ledger_id() -> str:
        nonlocal ledger_seq
        value = f"LED-{ledger_seq:04d}"
        ledger_seq += 1
        return value

    def next_invoice_id() -> str:
        nonlocal invoice_seq
        value = f"INV-{invoice_seq:04d}"
        invoice_seq += 1
        return value

    def next_bill_id() -> str:
        nonlocal bill_seq
        value = f"BILL-{bill_seq:04d}"
        bill_seq += 1
        return value

    def add_truth(record_id: str, source_type: str, category: str, counterparts: list[dict[str, str]]) -> None:
        record_truth[f"{source_type}:{record_id}"] = _record_truth_entry(category, source_type, record_id, counterparts)

    matched_categories = (
        ["clean_match"] * 30
        + ["fee_mismatch"] * 6
        + ["date_shift"] * 5
        + ["fuzzy_desc"] * 5
    )
    invoice_link_target = 25
    bill_link_target = 24
    matched_ledger_ids: list[str] = []

    for index, category in enumerate(matched_categories, start=1):
        bank_id = next_bank_id()
        ledger_id = next_ledger_id()
        amount = _money(random.uniform(45, 3200))
        customer_or_vendor = faker.company()[:24]
        ledger_date = base_date + timedelta(days=index)
        bank_date = ledger_date
        bank_amount = -amount
        description = _make_description(category, customer_or_vendor, ledger_id)
        memo = _make_memo(category, customer_or_vendor, bank_id)
        linked_txn_id = ledger_id if category == "clean_match" and index <= 10 else None

        if category == "fee_mismatch":
            fee_delta = _money(random.uniform(0.51, 4.95))
            bank_amount = -_money(amount + fee_delta)
            bank_date = ledger_date + timedelta(days=random.choice([-1, 0, 1]))
        elif category == "date_shift":
            bank_date = ledger_date + timedelta(days=random.randint(3, 5))
        elif category == "fuzzy_desc":
            bank_date = ledger_date + timedelta(days=random.randint(3, 5))

        bank_records.append(
            {
                "txn_id": bank_id,
                "date": bank_date.isoformat(),
                "amount": bank_amount,
                "description": description,
            }
        )
        ledger_records.append(
            {
                "entry_id": ledger_id,
                "date": ledger_date.isoformat(),
                "account": "Cash" if index % 2 == 0 else "Accounts Receivable",
                "debit_or_credit": "credit" if bank_amount < 0 else "debit",
                "amount": amount,
                "memo": memo,
                "linked_txn_id": linked_txn_id,
                "linked_bank_txn_id": bank_id,
                "linked_document_id": None,
            }
        )
        matched_ledger_ids.append(ledger_id)
        cases.append(
            _case_entry(
                f"case-{index:03d}",
                category,
                "bank_ledger",
                "bank",
                [bank_id],
                "ledger",
                [ledger_id],
            )
        )
        add_truth(bank_id, "bank", category, [{"source_type": "ledger", "record_id": ledger_id}])
        add_truth(ledger_id, "ledger", category, [{"source_type": "bank", "record_id": bank_id}])

    # Split-payment groups: one ledger entry matched by multiple bank transactions.
    split_specs = [(2, 0.50), (2, 0.25), (2, 0.75)]
    for split_index, (split_count, jitter) in enumerate(split_specs, start=1):
        ledger_id = next_ledger_id()
        source_name = faker.company()[:24]
        ledger_amount = _money(random.uniform(140, 950))
        ledger_date = base_date + timedelta(days=60 + split_index)
        remaining = ledger_amount
        bank_ids: list[str] = []
        bank_parts: list[float] = []
        for part_index in range(split_count):
            bank_id = next_bank_id()
            if part_index < split_count - 1:
                part = _money(round(ledger_amount / split_count + random.uniform(-jitter, jitter), 2))
                remaining = _money(remaining - abs(part))
            else:
                part = _money(abs(remaining))
            bank_ids.append(bank_id)
            bank_parts.append(part)
            bank_date = ledger_date + timedelta(days=random.randint(0, 3))
            bank_records.append(
                {
                    "txn_id": bank_id,
                    "date": bank_date.isoformat(),
                    "amount": -part,
                    "description": _make_description("split_payment", source_name, ledger_id),
                }
            )
            add_truth(bank_id, "bank", "split_payment", [{"source_type": "ledger", "record_id": ledger_id}])
        ledger_records.append(
            {
                "entry_id": ledger_id,
                "date": ledger_date.isoformat(),
                "account": "Accounts Payable",
                "debit_or_credit": "credit",
                "amount": ledger_amount,
                "memo": _make_memo("split_payment", source_name, ledger_id),
                "linked_txn_id": None,
                "linked_bank_txn_id": None,
                "linked_document_id": None,
            }
        )
        add_truth(ledger_id, "ledger", "split_payment", [{"source_type": "bank", "record_id": bank_id} for bank_id in bank_ids])
        cases.append(
            _case_entry(
                f"case-split-{split_index:02d}",
                "split_payment",
                "bank_ledger",
                "bank",
                bank_ids,
                "ledger",
                [ledger_id],
            )
        )

    # Add duplicate ledger entries: one original matched ledger already exists, plus a duplicate exception.
    for dup_index in range(3):
        duplicate_id = next_ledger_id()
        source_name = faker.company()[:24]
        duplicate_date = base_date + timedelta(days=90 + dup_index)
        original_id = matched_ledger_ids[dup_index]
        original_record = next(item for item in ledger_records if item["entry_id"] == original_id)
        ledger_records.append(
            {
                "entry_id": duplicate_id,
                "date": duplicate_date.isoformat(),
                "account": original_record["account"],
                "debit_or_credit": original_record["debit_or_credit"],
                "amount": original_record["amount"],
                "memo": _make_memo("duplicate", source_name, original_id),
                "linked_txn_id": None,
                "linked_bank_txn_id": None,
                "linked_document_id": None,
            }
        )
        add_truth(duplicate_id, "ledger", "duplicate", [])

    # Orphan and ambiguous records.
    for orphan_index in range(4):
        bank_id = next_bank_id()
        bank_date = base_date + timedelta(days=120 + orphan_index)
        amount = _money(random.uniform(8, 250))
        bank_records.append(
            {
                "txn_id": bank_id,
                "date": bank_date.isoformat(),
                "amount": -amount if orphan_index % 2 == 0 else amount,
                "description": _make_description("orphan_bank", "Bank fee", bank_id),
            }
        )
        add_truth(bank_id, "bank", "orphan_bank", [])

    for orphan_index in range(4):
        ledger_id = next_ledger_id()
        ledger_date = base_date + timedelta(days=130 + orphan_index)
        amount = _money(random.uniform(18, 300))
        ledger_records.append(
            {
                "entry_id": ledger_id,
                "date": ledger_date.isoformat(),
                "account": "Suspense",
                "debit_or_credit": "debit" if orphan_index % 2 == 0 else "credit",
                "amount": amount,
                "memo": _make_memo("orphan_ledger", faker.company()[:24], ledger_id),
                "linked_txn_id": None,
                "linked_bank_txn_id": None,
                "linked_document_id": None,
            }
        )
        add_truth(ledger_id, "ledger", "orphan_ledger", [])

    for ambiguous_index in range(4):
        bank_id = next_bank_id()
        ledger_id = next_ledger_id()
        amount = _money(random.uniform(50, 500))
        ledger_amount = _money(amount * random.uniform(1.08, 1.18))
        bank_date = base_date + timedelta(days=150 + ambiguous_index)
        ledger_date = bank_date + timedelta(days=random.randint(6, 8))
        descriptor_left = f"misc-{ambiguous_index}-{faker.word()}"
        descriptor_right = f"adjust-{ambiguous_index}-{faker.word()}"
        bank_records.append(
            {
                "txn_id": bank_id,
                "date": bank_date.isoformat(),
                "amount": -amount,
                "description": f"UNALLOCATED {descriptor_left}",
            }
        )
        ledger_records.append(
            {
                "entry_id": ledger_id,
                "date": ledger_date.isoformat(),
                "account": "Miscellaneous Expense",
                "debit_or_credit": "credit",
                "amount": ledger_amount,
                "memo": f"ADJ ENTRY {descriptor_right}",
                "linked_txn_id": None,
                "linked_bank_txn_id": None,
                "linked_document_id": None,
            }
        )
        add_truth(bank_id, "bank", "ambiguous", [])
        add_truth(ledger_id, "ledger", "ambiguous", [])

    # Invoice/bill generation linked to ledger records that should reconcile to bank records.
    all_ledger_records = [record for record in ledger_records if record["entry_id"] in matched_ledger_ids] + [
        record for record in ledger_records if record["entry_id"].startswith("LED-") and record["entry_id"] not in set(matched_ledger_ids)
    ]
    # Link the first 30 ledgers to invoices, next 30 to bills.
    invoice_ledgers = all_ledger_records[:30]
    bill_ledgers = all_ledger_records[30:60]

    for idx, ledger in enumerate(invoice_ledgers, start=1):
        invoice_id = next_invoice_id()
        customer = faker.company()[:24]
        issue_date = date.fromisoformat(ledger["date"]) - timedelta(days=random.randint(0, 2))
        due_date = issue_date + timedelta(days=30)
        invoices.append(
            {
                "invoice_id": invoice_id,
                "customer": customer,
                "amount": ledger["amount"],
                "issue_date": issue_date.isoformat(),
                "due_date": due_date.isoformat(),
                "status": "paid",
                "linked_ledger_id": ledger["entry_id"],
            }
        )
        ledger["linked_document_id"] = invoice_id
        ledger_truth = record_truth.get(f"ledger:{ledger['entry_id']}")
        if ledger_truth is not None:
            ledger_truth["counterparts"].append({"source_type": "invoice", "record_id": invoice_id})
        add_truth(invoice_id, "invoice", "clean_match", [{"source_type": "ledger", "record_id": ledger["entry_id"]}])

    for idx, ledger in enumerate(bill_ledgers, start=1):
        bill_id = next_bill_id()
        vendor = faker.company()[:24]
        issue_date = date.fromisoformat(ledger["date"]) - timedelta(days=random.randint(0, 2))
        due_date = issue_date + timedelta(days=30)
        bills.append(
            {
                "bill_id": bill_id,
                "vendor": vendor,
                "amount": ledger["amount"],
                "issue_date": issue_date.isoformat(),
                "due_date": due_date.isoformat(),
                "status": "paid",
                "linked_ledger_id": ledger["entry_id"],
            }
        )
        ledger["linked_document_id"] = bill_id
        ledger_truth = record_truth.get(f"ledger:{ledger['entry_id']}")
        if ledger_truth is not None:
            ledger_truth["counterparts"].append({"source_type": "bill", "record_id": bill_id})
        add_truth(bill_id, "bill", "clean_match", [{"source_type": "ledger", "record_id": ledger["entry_id"]}])

    # Fill the remaining invoices and bills with legitimate orphans.
    while len(invoices) < 60:
        invoice_id = next_invoice_id()
        issue_date = base_date + timedelta(days=180 + len(invoices))
        due_date = issue_date + timedelta(days=30)
        invoices.append(
            {
                "invoice_id": invoice_id,
                "customer": faker.company()[:24],
                "amount": _money(random.uniform(65, 1800)),
                "issue_date": issue_date.isoformat(),
                "due_date": due_date.isoformat(),
                "status": random.choice(["open", "past_due"]),
                "linked_ledger_id": None,
            }
        )
        add_truth(invoice_id, "invoice", "orphan_ledger", [])

    while len(bills) < 60:
        bill_id = next_bill_id()
        issue_date = base_date + timedelta(days=180 + len(bills))
        due_date = issue_date + timedelta(days=30)
        bills.append(
            {
                "bill_id": bill_id,
                "vendor": faker.company()[:24],
                "amount": _money(random.uniform(45, 2100)),
                "issue_date": issue_date.isoformat(),
                "due_date": due_date.isoformat(),
                "status": random.choice(["open", "past_due"]),
                "linked_ledger_id": None,
            }
        )
        add_truth(bill_id, "bill", "orphan_ledger", [])

    _running_balances(bank_records)

    # Align types and ordering for stable output.
    bank_records = sorted(bank_records, key=lambda item: item["txn_id"])
    ledger_records = sorted(ledger_records, key=lambda item: item["entry_id"])
    invoices = sorted(invoices, key=lambda item: item["invoice_id"])
    bills = sorted(bills, key=lambda item: item["bill_id"])
    cases = sorted(cases, key=lambda item: item["case_id"])

    ground_truth = {
        "seed": seed,
        "cases": cases,
        "record_truth": record_truth,
    }
    return GeneratedBundle(
        bank_statement=bank_records,
        general_ledger=ledger_records,
        invoices=invoices,
        bills=bills,
        ground_truth=ground_truth,
    )


def generate_and_save(seed: int | None = None, out_dir: Path | None = None) -> GeneratedBundle:
    settings = get_settings()
    bundle = generate_bundle(seed=seed)
    out_dir = out_dir or settings.generated_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "bank_statement.json": bundle.bank_statement,
        "general_ledger.json": bundle.general_ledger,
        "invoices.json": bundle.invoices,
        "bills.json": bundle.bills,
        "ground_truth.json": bundle.ground_truth,
    }
    for filename, payload in outputs.items():
        path = out_dir / filename
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return bundle
