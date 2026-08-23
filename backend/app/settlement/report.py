from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from app.settlement.scorer import ScoreReport
from app.settlement.utils import format_inr_amount


def _format_json(value: Any) -> str:
    return html.escape(json.dumps(value, indent=2, default=str, sort_keys=True))


def render_html_report(result: dict[str, Any], score: ScoreReport | None, source_files: dict[str, Path] | None = None) -> str:
    metrics = result["metrics"]
    score_section = score or ScoreReport(
        match_rate=metrics["match_rate"],
        precision=0.0,
        recall=0.0,
        f1=0.0,
        total_records=metrics["records_processed"],
        matched_records=metrics["matched_record_count"],
        pair_precision={"settlement_bank": 0.0, "settlement_order": 0.0},
        pair_recall={"settlement_bank": 0.0, "settlement_order": 0.0},
        pair_f1={"settlement_bank": 0.0, "settlement_order": 0.0},
        true_orphans=0,
        engine_misses=0,
    )
    source_line = ""
    if source_files:
        source_line = "".join(
            f"<li><strong>{html.escape(role)}</strong>: {html.escape(str(path))}</li>" for role, path in source_files.items()
        )
    matches = result["matches"]
    exceptions = result["exceptions"]

    match_rows = []
    for match in matches:
        match_rows.append(
            f"""
            <tr>
              <td>{html.escape(match['pair_type'])}</td>
              <td>{html.escape(', '.join(match['left_record_ids']))}</td>
              <td>{html.escape(', '.join(match['right_record_ids']))}</td>
              <td>{html.escape(str(match['tier']))}</td>
              <td>{html.escape(f"{match['confidence']:.1f}")}</td>
              <td>{html.escape(match['reasoning'])}</td>
              <td><details><summary>Evidence</summary><pre>{_format_json(match['evidence'])}</pre></details></td>
            </tr>
            """
        )

    exception_rows = []
    for item in exceptions:
        exception_rows.append(
            f"""
            <tr>
              <td>{html.escape(item['source_role'])}</td>
              <td>{html.escape(item['record_id'])}</td>
              <td>{html.escape(item['truth_status'])}</td>
              <td>{html.escape(item['reason'])}</td>
              <td>{html.escape(f"{item['reason_confidence']:.2f}")}</td>
              <td>{html.escape(item['suggested_action'])}</td>
              <td>{html.escape(str(item.get('best_candidate_id') or ''))}</td>
              <td>{html.escape(str(item.get('best_candidate_confidence') or ''))}</td>
              <td><details><summary>Evidence</summary><pre>{_format_json(item['evidence'])}</pre></details></td>
            </tr>
            """
        )

    note = (
        "True orphans are records that have no labeled counterpart in ground truth. "
        "Engine misses are records that do have a labeled counterpart, but the matcher did not accept or recover it."
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AI Finance Controller - Settlement Reconciliation Report</title>
  <style>
    :root {{
      --bg: #0f172a;
      --panel: #111827;
      --panel-soft: #1f2937;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #34d399;
      --accent-2: #60a5fa;
      --danger: #f87171;
      --border: rgba(148, 163, 184, 0.22);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: radial-gradient(circle at top left, #1e293b, var(--bg));
      color: var(--text);
      line-height: 1.5;
    }}
    .wrap {{ max-width: 1280px; margin: 0 auto; padding: 32px 20px 48px; }}
    .hero {{
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(17,24,39,.96), rgba(17,24,39,.86));
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 20px 60px rgba(15,23,42,.35);
    }}
    h1 {{ margin: 0 0 10px; font-size: 2rem; }}
    .sub {{ color: var(--muted); margin: 0 0 18px; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-top: 16px;
    }}
    .card {{
      background: rgba(31,41,55,.88);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }}
    .label {{ color: var(--muted); font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; }}
    .value {{ font-size: 1.7rem; font-weight: 700; margin-top: 6px; }}
    .section {{ margin-top: 26px; }}
    .section h2 {{ margin: 0 0 12px; font-size: 1.25rem; }}
    table {{ width: 100%; border-collapse: collapse; background: rgba(17,24,39,.8); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }}
    th, td {{ padding: 12px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }}
    th {{ font-size: .8rem; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }}
    tr:last-child td {{ border-bottom: none; }}
    details summary {{ cursor: pointer; color: var(--accent-2); }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      margin: 12px 0 0;
      background: #0b1220;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      color: #cbd5e1;
    }}
    .note {{
      margin-top: 18px;
      padding: 14px 16px;
      border-left: 4px solid var(--accent);
      background: rgba(16,185,129,.08);
      border-radius: 14px;
      color: #d1fae5;
    }}
    .muted {{ color: var(--muted); }}
    ul {{ margin: 8px 0 0 18px; color: var(--muted); }}
    .pill {{
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(96,165,250,.12);
      color: #bfdbfe;
      font-size: .78rem;
      margin-right: 8px;
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="pill">Settlement reconciliation</div>
      <div class="pill">CSV / Excel auto-detect</div>
      <div class="pill">Ground-truth scored</div>
      <h1>AI Finance Controller reconciliation report</h1>
      <p class="sub">Primary deliverable: the exception report, backed by an evidence trail for every accepted match.</p>
      <p class="sub">Currency standard: INR (for example {html.escape(format_inr_amount(123456.78))}).</p>
      <div class="grid">
        <div class="card"><div class="label">Match rate</div><div class="value">{score_section.match_rate:.3f}</div></div>
        <div class="card"><div class="label">Precision</div><div class="value">{score_section.precision:.3f}</div></div>
        <div class="card"><div class="label">Recall</div><div class="value">{score_section.recall:.3f}</div></div>
        <div class="card"><div class="label">F1</div><div class="value">{score_section.f1:.3f}</div></div>
        <div class="card"><div class="label">Records processed</div><div class="value">{metrics['records_processed']}</div></div>
        <div class="card"><div class="label">Processing time</div><div class="value">{metrics['processing_seconds']:.4f}s</div></div>
      </div>
      <div class="muted" style="margin-top: 12px;">
        Pair metrics: settlement-bank precision {score_section.pair_precision['settlement_bank']:.3f}, recall {score_section.pair_recall['settlement_bank']:.3f}, F1 {score_section.pair_f1['settlement_bank']:.3f} |
        settlement-order precision {score_section.pair_precision['settlement_order']:.3f}, recall {score_section.pair_recall['settlement_order']:.3f}, F1 {score_section.pair_f1['settlement_order']:.3f}
      </div>
      <div class="muted" style="margin-top: 6px;">
        True orphans: {score_section.true_orphans} | Engine misses: {score_section.engine_misses}
      </div>
    </div>

    <div class="section">
      <h2>Source files</h2>
      <div class="card">
        <ul>{source_line}</ul>
      </div>
    </div>

    <div class="section">
      <h2>Accepted matches</h2>
      <table>
        <thead>
          <tr>
            <th>Pair type</th>
            <th>Settlement</th>
            <th>Counterpart(s)</th>
            <th>Tier</th>
            <th>Confidence</th>
            <th>Reasoning</th>
            <th>Evidence trail</th>
          </tr>
        </thead>
        <tbody>
          {''.join(match_rows) if match_rows else '<tr><td colspan="7" class="muted">No matches were produced.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Exceptions</h2>
      <div class="note">{html.escape(note)}</div>
      <table style="margin-top: 14px;">
        <thead>
          <tr>
            <th>Source</th>
            <th>Record</th>
            <th>Truth status</th>
            <th>Reason</th>
            <th>Reason confidence</th>
            <th>Suggested action</th>
            <th>Best candidate</th>
            <th>Candidate confidence</th>
            <th>Evidence trail</th>
          </tr>
        </thead>
        <tbody>
          {''.join(exception_rows) if exception_rows else '<tr><td colspan="9" class="muted">No exceptions were produced.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>"""


def write_html_report(result: dict[str, Any], path: str | Path, score: ScoreReport | None = None, source_files: dict[str, Path] | None = None) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_html_report(result, score, source_files), encoding="utf-8")
    return output_path
