from __future__ import annotations

from pathlib import Path

from app.settlement.cli import run_cli
from app.settlement.generator import write_synthetic_dataset
from app.settlement.loader import load_reconciliation_bundle
from app.settlement.matcher import reconcile_bundle
from app.settlement.report import render_html_report
from app.settlement.scorer import score_against_ground_truth
from app.rag.qa_agent import QAAgent
from app.services.reconciliation_service import run_full_reconciliation


def test_prompt_generator_writes_three_csvs_and_ground_truth(tmp_path: Path):
    dataset = write_synthetic_dataset(seed=20260822, output_dir=tmp_path)

    assert (tmp_path / "settlement_report.csv").exists()
    assert (tmp_path / "bank_statement.csv").exists()
    assert (tmp_path / "order_ledger.csv").exists()
    assert (tmp_path / "ground_truth.csv").exists()
    assert len(dataset.settlement_report) >= 50
    assert len(dataset.bank_statement) >= 50
    assert len(dataset.order_ledger) >= 50
    assert len(dataset.ground_truth) > 0


def test_loader_auto_detects_alias_headers_and_normalizes_types(tmp_path: Path):
    write_synthetic_dataset(seed=20260822, output_dir=tmp_path)
    bundle = load_reconciliation_bundle([tmp_path])

    assert bundle.settlement_report[0]["source_role"] == "settlement"
    assert bundle.bank_statement[0]["source_role"] == "bank"
    assert bundle.order_ledger[0]["source_role"] == "order"
    assert isinstance(bundle.settlement_report[0]["payout_date"].year, int)
    assert isinstance(bundle.bank_statement[0]["statement_date"].year, int)
    assert isinstance(bundle.order_ledger[0]["order_date"].year, int)


def test_reconciliation_scores_against_ground_truth_and_renders_report(tmp_path: Path):
    write_synthetic_dataset(seed=20260822, output_dir=tmp_path)
    bundle = load_reconciliation_bundle([tmp_path])
    result = reconcile_bundle(bundle, tolerance_days=3, confidence_threshold=70.0)
    score = score_against_ground_truth(result, bundle.ground_truth)
    html = render_html_report(result, score, bundle.source_paths)

    assert result["metrics"]["records_processed"] >= 150
    assert 0.0 <= score.precision <= 1.0
    assert 0.0 <= score.recall <= 1.0
    assert 0.0 <= score.f1 <= 1.0
    assert score.true_orphans >= 1
    assert "True orphans" in html
    assert "<details>" in html


def test_cli_generates_report(tmp_path: Path):
    write_synthetic_dataset(seed=20260822, output_dir=tmp_path)
    report_path = tmp_path / "report.html"
    exit_code = run_cli([str(tmp_path), "--output", str(report_path)])

    assert exit_code == 0
    assert report_path.exists()


def test_qa_summary_uses_latest_run_counts(tmp_path: Path):
    response = run_full_reconciliation(seed=20260822)
    assert response["kpis"]["exception_count"] == len(response["exceptions"])

    answer = QAAgent().ask("how many exceptions are there?")

    assert str(response["kpis"]["exception_count"]) in answer.answer
    assert answer.confidence == "high"
