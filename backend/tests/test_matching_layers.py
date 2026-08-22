from __future__ import annotations

from app.matching.composite import composite_match_records
from app.matching.exact import exact_match_records
from app.matching.fuzzy import fuzzy_match_records


def test_exact_layer_matches_linked_records():
    banks = [{"txn_id": "B1", "date": "2026-01-01", "amount": -100.0, "description": "PAY ACME"}]
    ledgers = [
        {
            "entry_id": "L1",
            "date": "2026-01-01",
            "amount": 100.0,
            "memo": "Payment received",
            "linked_bank_txn_id": "B1",
        }
    ]

    matches = exact_match_records(
        banks,
        ledgers,
        "bank",
        "ledger",
        "txn_id",
        "entry_id",
        left_date_field="date",
        right_date_field="date",
        right_link_field="linked_bank_txn_id",
    )

    assert len(matches) == 1
    assert matches[0].left_id == "B1"
    assert matches[0].right_id == "L1"
    assert matches[0].confidence == 1.0


def test_fuzzy_layer_matches_fee_and_description_variation():
    banks = [{"txn_id": "B2", "date": "2026-01-03", "amount": -101.25, "description": "ACH ACME INV 10 FEE"}]
    ledgers = [
        {
            "entry_id": "L2",
            "date": "2026-01-01",
            "amount": 100.0,
            "memo": "Payment to Acme invoice 10",
        }
    ]

    matches = fuzzy_match_records(
        banks,
        ledgers,
        "bank",
        "ledger",
        "txn_id",
        "entry_id",
        left_date_field="date",
        right_date_field="date",
        left_text_field="description",
        right_text_field="memo",
    )

    assert len(matches) == 1
    assert matches[0].confidence >= 0.6
    assert matches[0].right_id == "L2"


def test_composite_layer_finds_split_payment():
    banks = [
        {"txn_id": "B3", "date": "2026-01-02", "amount": -40.0, "description": "PARTIAL ACME"},
        {"txn_id": "B4", "date": "2026-01-02", "amount": -60.0, "description": "PARTIAL ACME"},
    ]
    ledgers = [
        {
            "entry_id": "L3",
            "date": "2026-01-02",
            "amount": 100.0,
            "memo": "Split settlement for Acme",
        }
    ]

    matches = composite_match_records(
        banks,
        ledgers,
        left_source_type="bank",
        right_source_type="ledger",
        bank_id_field="txn_id",
        target_id_field="entry_id",
        bank_date_field="date",
        target_date_field="date",
    )

    assert len(matches) == 1
    assert matches[0].kind == "split_payment"
    assert matches[0].right_id == "L3"
    assert matches[0].metadata["bank_ids"] == ["B3", "B4"]

