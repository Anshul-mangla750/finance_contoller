from __future__ import annotations

import argparse
from pathlib import Path

from app.settlement.generator import write_synthetic_dataset
from app.settlement.loader import load_reconciliation_bundle
from app.settlement.matcher import reconcile_bundle
from app.settlement.report import write_html_report
from app.settlement.scorer import score_against_ground_truth


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reconcile settlement, bank, and order files.")
    parser.add_argument("files", nargs="*", help="Three settlement/bank/order files in any order, or a folder containing them.")
    parser.add_argument("--tolerance-days", type=int, default=3, help="Date tolerance window for deterministic matching.")
    parser.add_argument("--confidence-threshold", type=float, default=70.0, help="Minimum confidence required to accept a match.")
    parser.add_argument(
        "--output",
        default="reconciliation_report.html",
        help="HTML report output path.",
    )
    parser.add_argument(
        "--generate-sample",
        action="store_true",
        help="Generate the synthetic demo dataset instead of reconciling an input batch.",
    )
    return parser


def run_cli(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.generate_sample:
        dataset = write_synthetic_dataset()
        output_dir = dataset.output_dir or Path("backend/generated/settlement_prompt")
        print(f"Synthetic sample written to {output_dir}")
        print("Files:")
        print(f"  - {output_dir / 'settlement_report.csv'}")
        print(f"  - {output_dir / 'bank_statement.csv'}")
        print(f"  - {output_dir / 'order_ledger.csv'}")
        print(f"  - {output_dir / 'ground_truth.csv'}")
        return 0

    if not args.files:
        parser.error("Provide three files (or a folder) to reconcile, or use --generate-sample.")

    bundle = load_reconciliation_bundle(args.files)
    result = reconcile_bundle(bundle, tolerance_days=args.tolerance_days, confidence_threshold=args.confidence_threshold)
    score = score_against_ground_truth(result, bundle.ground_truth) if bundle.ground_truth else None
    report_path = write_html_report(result, args.output, score=score, source_files=bundle.source_paths)

    print(f"Processed {result['metrics']['records_processed']} records in {result['metrics']['processing_seconds']:.4f}s")
    print(
        "Match rate {0:.3f} | Precision {1:.3f} | Recall {2:.3f} | F1 {3:.3f}".format(
            score.match_rate if score else result["metrics"]["match_rate"],
            score.precision if score else 0.0,
            score.recall if score else 0.0,
            score.f1 if score else 0.0,
        )
    )
    if score:
        print(f"True orphans: {score.true_orphans} | Engine misses: {score.engine_misses}")
    print(f"Report written to {report_path}")
    return 0


def main() -> None:
    raise SystemExit(run_cli())

