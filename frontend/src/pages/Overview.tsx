import { ConfidenceChart } from "../components/ConfidenceChart";
import { KPICards } from "../components/KPICards";
import type { AccuracyReport, Kpis } from "../types";

type Props = { kpis: Kpis; accuracy: AccuracyReport; onRun: () => void; running: boolean };

const PAIR_LABELS: Record<string, string> = {
  bank_ledger: "Bank ↔ Ledger",
  ledger_invoice: "Ledger ↔ Invoice",
  ledger_bill: "Ledger ↔ Bill",
};

export function OverviewPage({ kpis, accuracy, onRun, running }: Props) {
  return (
    <div className="space-y-6 animate-fadeIn">
      <KPICards kpis={kpis} />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Checksum */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Checksum</div>
                <h2 className="mt-1 text-lg font-bold text-[#0f172a]">Reconciliation Arithmetic</h2>
                <p className="text-xs text-[#94a3b8] mt-0.5">For each source: total = matched + exceptions</p>
              </div>
              <button type="button" onClick={onRun} disabled={running} className="btn-accent btn-sm disabled:opacity-50">
                {running ? "Running..." : "Re-run"}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(accuracy.checksum).filter(([k]) => k !== "ok").map(([src, item]) => {
                const c = item as { total: number; matched: number; exceptions: number; ok: boolean };
                return (
                  <div key={src} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-[#0f172a] capitalize">{src}</span>
                      <span className={`badge ${c.ok ? "badge-green" : "badge-red"}`}>{c.ok ? "✓ OK" : "✗ Fail"}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(["total", "matched", "exceptions"] as const).map((k) => (
                        <div key={k}>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8]">{k}</div>
                          <div className="mt-1 text-lg font-bold text-[#0f172a]">{c[k]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-pair */}
          {Object.keys(accuracy.per_pair).length > 0 && (
            <div className="card p-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Per-Pair Accuracy</div>
              <h2 className="mt-1 text-lg font-bold text-[#0f172a]">Precision / Recall by Source Pair</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {Object.entries(accuracy.per_pair).map(([pair, m]) => (
                  <div key={pair} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                    <div className="text-sm font-bold text-[#0f172a] mb-3">{PAIR_LABELS[pair] ?? pair}</div>
                    <div className="space-y-2">
                      {([
                        ["Truth", m.truth_count, "text-[#64748b]"],
                        ["Predicted", m.predicted_count, "text-[#64748b]"],
                        ["Correct", m.correct_count, "text-[#10b981]"],
                      ] as const).map(([l, v, c]) => (
                        <div key={l} className="flex justify-between text-xs">
                          <span className="text-[#94a3b8]">{l}</span>
                          <span className={`font-bold ${c}`}>{v}</span>
                        </div>
                      ))}
                      <div className="border-t border-[#e2e8f0] pt-2 space-y-2">
                        {([
                          ["Precision", m.precision],
                          ["Recall", m.recall],
                          ["F1", m.f1],
                        ] as const).map(([l, v]) => (
                          <div key={l} className="flex justify-between text-xs">
                            <span className="text-[#94a3b8]">{l}</span>
                            <span className="font-bold text-[#0f172a]">{Math.round(v * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Chart */}
        <ConfidenceChart calibration={accuracy.calibration_table} />
      </div>
    </div>
  );
}
