from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from faker import Faker

from app.config import get_settings
from app.settlement.utils import write_csv_rows


@dataclass
class SyntheticDataset:
    settlement_report: list[dict[str, Any]]
    bank_statement: list[dict[str, Any]]
    order_ledger: list[dict[str, Any]]
    ground_truth: list[dict[str, Any]]
    output_dir: Path | None = None


SETTLEMENT_HEADERS = [
    "payout_ref",
    "gross_total",
    "processing_fee",
    "payout_net",
    "payout_dt",
    "curr_code",
    "note",
    "bank_reference",
]

BANK_HEADERS = [
    "bank_txn_id",
    "posted_on",
    "deposit_amt",
    "memo",
    "ref_no",
    "currency_code",
]

ORDER_HEADERS = [
    "order_id",
    "order_total",
    "ordered_at",
    "customer_code",
    "status_flag",
    "memo",
    "ref_no",
]

GROUND_TRUTH_HEADERS = [
    "source_role",
    "record_id",
    "matched_source_role",
    "matched_record_ids",
    "case_type",
    "is_true_orphan",
    "group_id",
]


def _money(value: float) -> float:
    return round(value + 1e-9, 2)


def _reference(prefix: str, seq: int) -> str:
    return f"{prefix}-{seq:04d}"


def _case_truth(
    source_role: str,
    record_id: str,
    matched_source_role: str,
    matched_record_ids: list[str],
    case_type: str,
    group_id: str,
) -> dict[str, Any]:
    return {
        "source_role": source_role,
        "record_id": record_id,
        "matched_source_role": matched_source_role,
        "matched_record_ids": "|".join(matched_record_ids),
        "case_type": case_type,
        "is_true_orphan": not matched_record_ids,
        "group_id": group_id,
    }


def _currency_code() -> str:
    return "INR"


def _build_clean_case(
    rng: random.Random,
    faker: Faker,
    settlement_seq: int,
    bank_seq: int,
    order_seq: int,
    base_date: date,
    group_id: str,
    exact_reference: bool,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]], int, int, int]:
    transaction_id = _reference("SET", settlement_seq)
    bank_id = _reference("BNK", bank_seq)
    order_id = _reference("ORD", order_seq)
    customer = faker.bothify(text="CUST-##??").upper()
    gross = _money(rng.uniform(120, 2800))
    fee = _money(rng.uniform(0.75, 15.25))
    if rng.random() < 0.35:
        fee = -fee
    net = _money(gross - abs(fee))
    settlement_date = base_date + timedelta(days=rng.randint(0, 45))
    bank_date = settlement_date + timedelta(days=rng.choice([0, 0, 1]))
    order_date = settlement_date - timedelta(days=rng.choice([1, 0, 1]))
    reference = transaction_id if exact_reference else ""
    note = f"Settlement for {customer} {group_id}"
    memo = f"Deposit for {customer} {group_id}"
    order_memo = f"Order for {customer} {group_id}"
    settlement = {
        "payout_ref": transaction_id,
        "gross_total": gross,
        "processing_fee": fee,
        "payout_net": net,
        "payout_dt": settlement_date.isoformat(),
        "curr_code": _currency_code(),
        "note": note,
        "bank_reference": reference,
    }
    bank = {
        "bank_txn_id": bank_id,
        "posted_on": bank_date.isoformat(),
        "deposit_amt": net if rng.random() < 0.5 else -net,
        "memo": memo,
        "ref_no": reference,
        "currency_code": _currency_code(),
    }
    order = {
        "order_id": order_id,
        "order_total": net,
        "ordered_at": order_date.isoformat(),
        "customer_code": customer,
        "status_flag": "paid",
        "memo": order_memo,
        "ref_no": reference,
    }
    truth = [
        _case_truth("settlement", transaction_id, "bank", [bank_id], "clean_1_to_1", group_id),
        _case_truth("settlement", transaction_id, "order", [order_id], "clean_1_to_1", group_id),
        _case_truth("bank", bank_id, "settlement", [transaction_id], "clean_1_to_1", group_id),
        _case_truth("order", order_id, "settlement", [transaction_id], "clean_1_to_1", group_id),
    ]
    return settlement, bank, order, truth, settlement_seq + 1, bank_seq + 1, order_seq + 1


def _build_date_shift_case(
    rng: random.Random,
    faker: Faker,
    settlement_seq: int,
    bank_seq: int,
    order_seq: int,
    base_date: date,
    group_id: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]], int, int, int]:
    transaction_id = _reference("SET", settlement_seq)
    bank_id = _reference("BNK", bank_seq)
    order_id = _reference("ORD", order_seq)
    customer = faker.bothify(text="CUST-##??").upper()
    gross = _money(rng.uniform(250, 4200))
    fee = _money(rng.uniform(1.25, 18.5))
    if rng.random() < 0.5:
        fee = -fee
    net = _money(gross - abs(fee))
    settlement_date = base_date + timedelta(days=rng.randint(5, 55))
    bank_date = settlement_date + timedelta(days=rng.randint(1, 5))
    order_date = settlement_date - timedelta(days=rng.randint(1, 3))
    settlement = {
        "payout_ref": transaction_id,
        "gross_total": gross,
        "processing_fee": fee,
        "payout_net": net,
        "payout_dt": settlement_date.isoformat(),
        "curr_code": _currency_code(),
        "note": f"Weekend settlement lag for {customer}",
        "bank_reference": "",
    }
    bank = {
        "bank_txn_id": bank_id,
        "posted_on": bank_date.isoformat(),
        "deposit_amt": net if rng.random() < 0.5 else -net,
        "memo": f"Cleared after delay for {customer}",
        "ref_no": "",
        "currency_code": _currency_code(),
    }
    order = {
        "order_id": order_id,
        "order_total": net,
        "ordered_at": order_date.isoformat(),
        "customer_code": customer,
        "status_flag": "paid",
        "memo": f"Order closed for {customer}",
        "ref_no": "",
    }
    truth = [
        _case_truth("settlement", transaction_id, "bank", [bank_id], "date_shifted", group_id),
        _case_truth("settlement", transaction_id, "order", [order_id], "date_shifted", group_id),
        _case_truth("bank", bank_id, "settlement", [transaction_id], "date_shifted", group_id),
        _case_truth("order", order_id, "settlement", [transaction_id], "date_shifted", group_id),
    ]
    return settlement, bank, order, truth, settlement_seq + 1, bank_seq + 1, order_seq + 1


def _build_amount_mismatch_case(
    rng: random.Random,
    faker: Faker,
    settlement_seq: int,
    bank_seq: int,
    order_seq: int,
    base_date: date,
    group_id: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[dict[str, Any]], int, int, int]:
    transaction_id = _reference("SET", settlement_seq)
    bank_id = _reference("BNK", bank_seq)
    order_id = _reference("ORD", order_seq)
    customer = faker.bothify(text="CUST-##??").upper()
    gross = _money(rng.uniform(180, 3800))
    fee = _money(rng.uniform(1.5, 22.0))
    net = _money(gross - abs(fee))
    bank_delta = _money(rng.uniform(0.35, 4.95))
    order_delta = _money(rng.uniform(0.35, 4.95))
    settlement_date = base_date + timedelta(days=rng.randint(15, 65))
    bank_date = settlement_date + timedelta(days=rng.choice([0, 1]))
    order_date = settlement_date - timedelta(days=rng.choice([0, 1]))
    settlement = {
        "payout_ref": transaction_id,
        "gross_total": gross,
        "processing_fee": fee,
        "payout_net": net,
        "payout_dt": settlement_date.isoformat(),
        "curr_code": _currency_code(),
        "note": f"Round-off and fee variance for {customer}",
        "bank_reference": "",
    }
    bank = {
        "bank_txn_id": bank_id,
        "posted_on": bank_date.isoformat(),
        "deposit_amt": (net - bank_delta) if rng.random() < 0.5 else -(net - bank_delta),
        "memo": f"Deposit net of processor fees for {customer}",
        "ref_no": "",
        "currency_code": _currency_code(),
    }
    order = {
        "order_id": order_id,
        "order_total": net + order_delta,
        "ordered_at": order_date.isoformat(),
        "customer_code": customer,
        "status_flag": "paid",
        "memo": f"Order total includes small refund for {customer}",
        "ref_no": "",
    }
    truth = [
        _case_truth("settlement", transaction_id, "bank", [bank_id], "amount_mismatch", group_id),
        _case_truth("settlement", transaction_id, "order", [order_id], "amount_mismatch", group_id),
        _case_truth("bank", bank_id, "settlement", [transaction_id], "amount_mismatch", group_id),
        _case_truth("order", order_id, "settlement", [transaction_id], "amount_mismatch", group_id),
    ]
    return settlement, bank, order, truth, settlement_seq + 1, bank_seq + 1, order_seq + 1


def _build_many_to_one_case(
    rng: random.Random,
    faker: Faker,
    settlement_seq: int,
    bank_seq: int,
    order_seq: int,
    base_date: date,
    group_id: str,
    order_count: int,
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], int, int, int]:
    transaction_id = _reference("SET", settlement_seq)
    bank_id = _reference("BNK", bank_seq)
    customer = faker.bothify(text="CUST-##??").upper()
    order_ids = [_reference("ORD", order_seq + idx) for idx in range(order_count)]
    order_amounts: list[float] = []
    settlement_date = base_date + timedelta(days=rng.randint(20, 70))
    order_dates = [settlement_date - timedelta(days=rng.randint(1, 5)) for _ in range(order_count)]
    for idx in range(order_count):
        order_amounts.append(_money(rng.uniform(60, 420)))
    settlement_net = _money(sum(order_amounts))
    gross = _money(settlement_net + rng.uniform(5.0, 25.0))
    fee = _money(gross - settlement_net)
    if rng.random() < 0.5:
        fee = -fee
    bank_date = settlement_date + timedelta(days=rng.randint(0, 2))
    settlement = {
        "payout_ref": transaction_id,
        "gross_total": gross,
        "processing_fee": fee,
        "payout_net": settlement_net,
        "payout_dt": settlement_date.isoformat(),
        "curr_code": _currency_code(),
        "note": f"Batch payout for {customer}",
        "bank_reference": "",
    }
    bank = {
        "bank_txn_id": bank_id,
        "posted_on": bank_date.isoformat(),
        "deposit_amt": settlement_net if rng.random() < 0.5 else -settlement_net,
        "memo": f"Batch deposit for {customer}",
        "ref_no": "",
        "currency_code": _currency_code(),
    }
    orders: list[dict[str, Any]] = []
    for idx, order_id in enumerate(order_ids):
        orders.append(
            {
                "order_id": order_id,
                "order_total": order_amounts[idx],
                "ordered_at": order_dates[idx].isoformat(),
                "customer_code": customer,
                "status_flag": "paid",
                "memo": f"Batch order {idx + 1} for {customer}",
                "ref_no": "",
            }
        )
    truth = [
        _case_truth("settlement", transaction_id, "bank", [bank_id], "many_to_one", group_id),
        _case_truth("bank", bank_id, "settlement", [transaction_id], "many_to_one", group_id),
        _case_truth("settlement", transaction_id, "order", order_ids, "many_to_one", group_id),
    ]
    truth.extend(_case_truth("order", order_id, "settlement", [transaction_id], "many_to_one", group_id) for order_id in order_ids)
    return orders, settlement, bank, truth, settlement_seq + 1, bank_seq + 1, order_seq + order_count


def _build_orphan_settlement(
    rng: random.Random,
    settlement_seq: int,
    base_date: date,
    group_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    transaction_id = _reference("SET", settlement_seq)
    gross = _money(rng.uniform(100, 3000))
    fee = _money(rng.uniform(1.0, 22.0))
    net = _money(gross - abs(fee))
    settlement_date = base_date + timedelta(days=rng.randint(75, 90))
    settlement = {
        "payout_ref": transaction_id,
        "gross_total": gross,
        "processing_fee": fee,
        "payout_net": net,
        "payout_dt": settlement_date.isoformat(),
        "curr_code": _currency_code(),
        "note": f"Orphan settlement {group_id}",
        "bank_reference": "",
    }
    truth = [_case_truth("settlement", transaction_id, "", [], "orphan", group_id)]
    return settlement, truth, settlement_seq + 1


def _build_orphan_bank(
    rng: random.Random,
    bank_seq: int,
    base_date: date,
    group_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    bank_id = _reference("BNK", bank_seq)
    amount = _money(rng.uniform(75, 2100))
    bank_date = base_date + timedelta(days=rng.randint(75, 90))
    bank = {
        "bank_txn_id": bank_id,
        "posted_on": bank_date.isoformat(),
        "deposit_amt": amount if rng.random() < 0.5 else -amount,
        "memo": f"Orphan deposit {group_id}",
        "ref_no": "",
        "currency_code": _currency_code(),
    }
    truth = [_case_truth("bank", bank_id, "", [], "orphan", group_id)]
    return bank, truth, bank_seq + 1


def _build_orphan_order(
    rng: random.Random,
    faker: Faker,
    order_seq: int,
    base_date: date,
    group_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    order_id = _reference("ORD", order_seq)
    amount = _money(rng.uniform(50, 1300))
    order_date = base_date + timedelta(days=rng.randint(75, 90))
    customer = faker.bothify(text="CUST-##??").upper()
    order = {
        "order_id": order_id,
        "order_total": amount,
        "ordered_at": order_date.isoformat(),
        "customer_code": customer,
        "status_flag": "open",
        "memo": f"Orphan order {group_id}",
        "ref_no": "",
    }
    truth = [_case_truth("order", order_id, "", [], "orphan", group_id)]
    return order, truth, order_seq + 1


def generate_synthetic_dataset(seed: int | None = None, output_dir: Path | None = None) -> SyntheticDataset:
    settings = get_settings()
    seed = settings.seed if seed is None else seed
    rng = random.Random(seed)
    faker = Faker()
    faker.seed_instance(seed)
    base_date = date(2026, 6, 1)

    settlement_rows: list[dict[str, Any]] = []
    bank_rows: list[dict[str, Any]] = []
    order_rows: list[dict[str, Any]] = []
    truth_rows: list[dict[str, Any]] = []

    settlement_seq = 1
    bank_seq = 1
    order_seq = 1

    for index in range(42):
        exact_reference = index < 20
        settlement, bank, order, truth, settlement_seq, bank_seq, order_seq = _build_clean_case(
            rng,
            faker,
            settlement_seq,
            bank_seq,
            order_seq,
            base_date,
            f"clean-{index + 1:02d}",
            exact_reference,
        )
        settlement_rows.append(settlement)
        bank_rows.append(bank)
        order_rows.append(order)
        truth_rows.extend(truth)

    for index in range(6):
        settlement, bank, order, truth, settlement_seq, bank_seq, order_seq = _build_date_shift_case(
            rng,
            faker,
            settlement_seq,
            bank_seq,
            order_seq,
            base_date,
            f"shift-{index + 1:02d}",
        )
        settlement_rows.append(settlement)
        bank_rows.append(bank)
        order_rows.append(order)
        truth_rows.extend(truth)

    for index in range(6):
        settlement, bank, order, truth, settlement_seq, bank_seq, order_seq = _build_amount_mismatch_case(
            rng,
            faker,
            settlement_seq,
            bank_seq,
            order_seq,
            base_date,
            f"mismatch-{index + 1:02d}",
        )
        settlement_rows.append(settlement)
        bank_rows.append(bank)
        order_rows.append(order)
        truth_rows.extend(truth)

    for index, order_count in enumerate((2, 3, 2), start=1):
        orders, settlement, bank, truth, settlement_seq, bank_seq, order_seq = _build_many_to_one_case(
            rng,
            faker,
            settlement_seq,
            bank_seq,
            order_seq,
            base_date,
            f"batch-{index:02d}",
            order_count,
        )
        settlement_rows.append(settlement)
        bank_rows.append(bank)
        order_rows.extend(orders)
        truth_rows.extend(truth)

    settlement, truth, settlement_seq = _build_orphan_settlement(rng, settlement_seq, base_date, "orphan-settlement")
    settlement_rows.append(settlement)
    truth_rows.extend(truth)

    bank, truth, bank_seq = _build_orphan_bank(rng, bank_seq, base_date, "orphan-bank")
    bank_rows.append(bank)
    truth_rows.extend(truth)

    order, truth, order_seq = _build_orphan_order(rng, faker, order_seq, base_date, "orphan-order")
    order_rows.append(order)
    truth_rows.extend(truth)

    dataset = SyntheticDataset(
        settlement_report=settlement_rows,
        bank_statement=bank_rows,
        order_ledger=order_rows,
        ground_truth=truth_rows,
        output_dir=output_dir,
    )
    return dataset


def write_synthetic_dataset(seed: int | None = None, output_dir: Path | None = None) -> SyntheticDataset:
    settings = get_settings()
    dataset = generate_synthetic_dataset(seed=seed, output_dir=output_dir or settings.generated_dir / "settlement_prompt")
    output_path = dataset.output_dir or settings.generated_dir / "settlement_prompt"
    output_path.mkdir(parents=True, exist_ok=True)
    write_csv_rows(output_path / "settlement_report.csv", dataset.settlement_report, SETTLEMENT_HEADERS)
    write_csv_rows(output_path / "bank_statement.csv", dataset.bank_statement, BANK_HEADERS)
    write_csv_rows(output_path / "order_ledger.csv", dataset.order_ledger, ORDER_HEADERS)
    write_csv_rows(output_path / "ground_truth.csv", dataset.ground_truth, GROUND_TRUTH_HEADERS)
    return dataset
