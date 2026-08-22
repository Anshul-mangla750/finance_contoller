import { ConfidenceChart } from "../components/ConfidenceChart";
import { KPICards } from "../components/KPICards";
import type { AccuracyReport, Kpis } from "../types";

type Props = { kpis: Kpis; accuracy: AccuracyReport; onRun: () => void; running: boolean };

const PAIR_LABELS: Record<string, string> = {
  bank_ledger: "Bank ↔ Ledger",
  ledger_invoice: "Ledger ↔ Invoice (AR)",
  ledger_bill: "Ledger ↔ Bill (AP)",
};

export function OverviewPage({ kpis, accuracy, onRun, running }: Props) {
  return (
    <div className="space-y-6">
      {/* Hero Stats Banner */}
      <div className="elevated p-6 bg-gradient-to-r from-[#0f172a] to-[#1e293b] text-white anim-fade-up">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400 mb-1">Reconciliation Complete</div>
            <h2 className="text-2xl font-extrabold tracking-tight">
              {kpis.records_processed} records processed —{" "}
              <span className="text-emerald-400">{Math.round(kpis.match_rate * 100)}%</span> auto-matched
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {kpis.precision > 0 ? `${Math.round(kpis.precision * 100)}% precision, ` : ""}
              {kpis.recall > 0 ? `${Math.round(kpis.recall * 100)}% recall, ` : ""}
              {kpis.f1 > 0 ? `${Math.round(kpis.f1 * 100)}% F1 — ` : ""}
              {kpis.exception_count} records flagged for human review.
            </p>
          </div>
          <button onClick={onRun} disabled={running} className="btn-green shrink-0">
            {running ? "Running..." : "Re-run Batch"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards kpis={kpis} />

      {/* Two Column: Checksum + Chart */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        {/* Left: Checksum + Per-pair */}
        <div className="space-y-6">
          {/* Checksum */}
          <div className="solid p-6 anim-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Checksum</div>
                <h3 className="mt-1 text-lg font-bold text-gray-900">Reconciliation Arithmetic</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">total = matched + exceptions (per source)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(accuracy.checksum).filter(([k]) => k !== "ok").map(([src, item], i) => {
                const c = item as { total: number; matched: number; exceptions: number; ok: boolean };
                return (
                  <div key={src} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 anim-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-900 capitalize">{src}</span>
                      <span className={`pill ${c.ok ? "pill-green" : "pill-red"}`}>{c.ok ? "✓ OK" : "✗ Fail"}</span>
                    </div>
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <div className="bar-track">
                          <div className="bar-fill bg-emerald-500" style={{ width: `${c.total ? (c.matched / c.total) * 100 : 0}%` }} />
                        </div>
                        <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
                          <span>{c.matched} matched</span>
                          <span>{c.exceptions} exceptions</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-extrabold text-gray-900">{c.total}</div>
                        <div className="text-[9px] uppercase tracking-wider text-gray-400">total</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-pair accuracy */}
          {Object.keys(accuracy.per_pair).length > 0 && (
            <div className="solid p-6 anim-fade-up" style={{ animationDelay: "0.2s" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-1">Per-Pair Accuracy</div>
              <h3 className="text-lg font-bold text-gray-900">Precision & Recall by Source Pair</h3>
              <div className="mt-4 space-y-3">
                {Object.entries(accuracy.per_pair).map(([pair, m], i) => (
                  <div key={pair} className="rounded-xl border border-gray-200 p-4 anim-slide-right" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-900">{PAIR_LABELS[pair] ?? pair}</span>
                      <span className="pill pill-green">{Math.round(m.f1 * 100)}% F1</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Truth</div>
                        <div className="text-lg font-extrabold text-gray-900">{m.truth_count}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Predicted</div>
                        <div className="text-lg font-extrabold text-gray-900">{m.predicted_count}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Correct</div>
                        <div className="text-lg font-extrabold text-emerald-600">{m.correct_count}</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">Precision</span><span className="font-bold">{Math.round(m.precision * 100)}%</span></div>
                        <div className="bar-track"><div className="bar-fill bg-blue-500" style={{ width: `${m.precision * 100}%` }} /></div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">Recall</span><span className="font-bold">{Math.round(m.recall * 100)}%</span></div>
                        <div className="bar-track"><div className="bar-fill bg-purple-500" style={{ width: `${m.recall * 100}%` }} /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Chart */}
        <ConfidenceChart calibration={accuracy.calibration_table} />
      </div>
    </div>
  );
}
