from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.matching.pipeline import PipelineRunResult
from app.scoring.scorer import AccuracyScorer, build_truth_pair_sets, compute_calibration_table


def test_scoring_precision_recall_and_checksum():
    ground_truth = {
        "record_truth": {
            "bank:B1": {"counterparts": [{"source_type": "ledger", "record_id": "L1"}]},
            "ledger:L1": {
                "counterparts": [
                    {"source_type": "bank", "record_id": "B1"},
                    {"source_type": "invoice", "record_id": "I1"},
                ]
            },
            "invoice:I1": {"counterparts": [{"source_type": "ledger", "record_id": "L1"}]},
        }
    }
    scorer = AccuracyScorer(ground_truth)
    pipeline_result = PipelineRunResult(
        run_id="run-1",
        matches=[
            {
                "pair_type": "bank_ledger",
                "source_a_type": "bank",
                "source_a_id": "B1",
                "source_b_type": "ledger",
                "source_b_id": "L1",
                "match_layer": 1,
                "match_kind": "exact",
                "confidence": 1.0,
                "reasoning": "linked",
            },
            {
                "pair_type": "ledger_invoice",
                "source_a_type": "ledger",
                "source_a_id": "L1",
                "source_b_type": "invoice",
                "source_b_id": "I1",
                "match_layer": 1,
                "match_kind": "exact",
                "confidence": 0.9,
                "reasoning": "linked",
            },
        ],
        exceptions=[
            {"source_type": "bank", "record_id": "B2"},
            {"source_type": "ledger", "record_id": "L2"},
            {"source_type": "invoice", "record_id": "I2"},
            {"source_type": "bill", "record_id": "X1"},
        ],
        matched_source_ids={
            "bank": {"B1"},
            "ledger": {"L1"},
            "invoice": {"I1"},
            "bill": set(),
        },
        source_totals={"bank": 2, "ledger": 2, "invoice": 2, "bill": 1},
    )

    report = scorer.score(pipeline_result, pipeline_result.source_totals, cash_position=1234.56)
    assert report.precision == 1.0
    assert report.recall == 1.0
    assert report.f1 == 1.0
    assert report.checksum["ok"] is True
    assert report.total_records == 7
    assert report.exception_count == 4


def test_scoring_checksum_fails_when_totals_do_not_reconcile():
    ground_truth = {"record_truth": {}}
    scorer = AccuracyScorer(ground_truth)
    pipeline_result = PipelineRunResult(
        run_id="run-2",
        matches=[],
        exceptions=[],
        matched_source_ids={"bank": set(), "ledger": set(), "invoice": set(), "bill": set()},
        source_totals={"bank": 1, "ledger": 0, "invoice": 0, "bill": 0},
    )

    with pytest.raises(ValueError):
        scorer.score(pipeline_result, pipeline_result.source_totals, cash_position=0.0)
