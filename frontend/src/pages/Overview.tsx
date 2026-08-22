import { ConfidenceChart } from "../components/ConfidenceChart";
import { KPICards } from "../components/KPICards";
import type { AccuracyReport, Kpis } from "../types";

type Props = {
  kpis: Kpis;
  accuracy: AccuracyReport;
  onRun: () => void;
  running: boolean;
};

export function OverviewPage({ kpis, accuracy, onRun, running }: Props) {
  return (
    <div className="space-y-6 animate-fadeInUp">
      <KPICards kpis={kpis} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="metric-label">Checksum</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink-950">Reconciliation arithmetic</h2>
            </div>
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className="rounded-full bg-moss-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-moss-400 disabled:opacity-60"
            >
              {running ? "Running..." : "Run Reconciliation"}
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {Object.entries(accuracy.checksum)
              .filter(([key]) => key !== "ok")
              .map(([source, item]) => {
                const checksum = item as { total: number; matched: number; exceptions: number; ok: boolean };
                return (
                  <div key={source} className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold capitalize text-ink-800">{source}</div>
                      <div className={`text-xs font-semibold ${checksum.ok ? "text-moss-500" : "text-red-600"}`}>
                        {checksum.ok ? "OK" : "Mismatch"}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-ink-600">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-ink-400">Total</div>
                        <div className="mt-1 font-semibold text-ink-900">{checksum.total}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-ink-400">Matched</div>
                        <div className="mt-1 font-semibold text-ink-900">{checksum.matched}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-ink-400">Exceptions</div>
                        <div className="mt-1 font-semibold text-ink-900">{checksum.exceptions}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <ConfidenceChart calibration={accuracy.calibration_table} />
      </div>
    </div>
  );
}
