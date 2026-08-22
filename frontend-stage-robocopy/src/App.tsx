import { useEffect, useState } from "react";
import { loadLatestRun, runFolderReconciliation, runReconciliation, uploadReconciliation } from "./api";
import { ReconciliationIngress } from "./components/ReconciliationIngress";
import { AskAgentPage } from "./pages/AskAgent";
import { MatchesPage } from "./pages/Matches";
import { OverviewPage } from "./pages/Overview";
import type { ExceptionRow, MatchRow, ReconcileResponse } from "./types";

type View = "overview" | "matches" | "ask";

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<ReconcileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const latest = await loadLatestRun();
        setData(latest);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load latest run.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const result = await runReconciliation();
      setData(result);
      setFocusedRecordId(null);
      setView("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleUpload(files: Parameters<typeof uploadReconciliation>[0]) {
    setRunning(true);
    setError(null);
    try {
      const result = await uploadReconciliation(files);
      setData(result);
      setFocusedRecordId(null);
      setView("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload reconciliation failed.");
      throw err;
    } finally {
      setRunning(false);
    }
  }

  async function handleRunFromFolder(inputDir: string) {
    setRunning(true);
    setError(null);
    try {
      const result = await runFolderReconciliation(inputDir);
      setData(result);
      setFocusedRecordId(null);
      setView("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder reconciliation failed.");
      throw err;
    } finally {
      setRunning(false);
    }
  }

  function handleFocusRecord(recordId: string) {
    setFocusedRecordId(recordId);
    const inExceptions = data?.exceptions.some((row) => row.record_id === recordId) ?? false;
    setView(inExceptions ? "matches" : "matches");
  }

  const matches = data?.matches ?? [];
  const exceptions = data?.exceptions ?? [];

  return (
    <div className="min-h-screen px-4 py-6 text-ink-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="panel-soft relative mb-6 overflow-hidden p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(90,164,105,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(217,119,6,0.14),transparent_30%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-moss-500">AI Finance Controller</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-ink-950 sm:text-5xl">
                Live reconciliation with measurable truth.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600 sm:text-base">
                Every batch runs end-to-end on the synthetic datasets, computes precision/recall against hidden truth,
                and surfaces unresolved cases in a visible exception list.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={running}
              className="inline-flex items-center justify-center rounded-full bg-ink-950 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? "Running batch..." : "Run Reconciliation"}
            </button>
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["matches", "Matches & Exceptions"],
            ["ask", "Ask the Agent"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key as View)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                view === key ? "bg-ink-950 text-white shadow-md" : "bg-white/80 text-ink-700 hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
          {error ? <span className="ml-auto rounded-full bg-red-50 px-4 py-2 text-sm text-red-700">{error}</span> : null}
        </nav>

        {loading ? (
          <div className="panel p-10 text-center text-ink-600">Loading latest reconciliation run...</div>
        ) : null}

        {!loading && data ? (
          <>
            {view === "overview" ? (
              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleRunFromFolder} busy={running} />
            ) : null}
            {view === "overview" ? (
              <OverviewPage
                kpis={data.kpis}
                accuracy={data.accuracy}
                onRun={handleRun}
                running={running}
              />
            ) : null}
            {view === "matches" ? (
              <MatchesPage
                matches={matches}
                exceptions={exceptions}
                focusedRecordId={focusedRecordId}
                onFocusRecord={handleFocusRecord}
              />
            ) : null}
            {view === "ask" ? (
              <AskAgentPage onFocusRecord={handleFocusRecord} />
            ) : null}
          </>
        ) : null}

        {!loading && !data ? (
          <div className="space-y-6">
            <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleRunFromFolder} busy={running} />
            <div className="panel p-8 text-ink-700">
              No reconciliation run is available yet. Use <span className="font-semibold">Run Reconciliation</span> to
              generate the synthetic batch and metrics, or upload your own files above.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
