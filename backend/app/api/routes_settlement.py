from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settlement.loader import load_reconciliation_bundle
from app.settlement.matcher import reconcile_bundle
from app.settlement.report import write_html_report
from app.settlement.scorer import score_against_ground_truth


router = APIRouter(prefix="/api/settlement", tags=["settlement"])


class FolderRequest(BaseModel):
    input_dir: str
    output_report: str | None = None
    tolerance_days: int = 3
    confidence_threshold: float = 70.0


@router.post("/reconcile-folder")
def reconcile_folder(payload: FolderRequest) -> dict:
    try:
        bundle = load_reconciliation_bundle([payload.input_dir])
        result = reconcile_bundle(bundle, tolerance_days=payload.tolerance_days, confidence_threshold=payload.confidence_threshold)
        score = score_against_ground_truth(result, bundle.ground_truth) if bundle.ground_truth else None
        report_path = write_html_report(result, payload.output_report or "reconciliation_report.html", score=score, source_files=bundle.source_paths)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "report_path": str(report_path),
        "metrics": result["metrics"],
        "score": score.__dict__ if score else None,
        "matches": result["matches"],
        "exceptions": result["exceptions"],
    }

