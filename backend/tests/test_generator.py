from __future__ import annotations

from app.data_gen.generator import generate_bundle


def test_generator_emits_full_batches_and_truth():
    bundle = generate_bundle(seed=20260822)
    assert len(bundle.bank_statement) == 60
    assert len(bundle.general_ledger) == 60
    assert len(bundle.invoices) == 60
    assert len(bundle.bills) == 60
    assert "record_truth" in bundle.ground_truth
    assert len(bundle.ground_truth["cases"]) >= 3

