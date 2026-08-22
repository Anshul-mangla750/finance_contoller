import { useEffect, useState } from "react";
import { loadLatestRun, runFolderReconciliation, runReconciliation, uploadReconciliation } from "./api";
import { ReconciliationIngress } from "./components/ReconciliationIngress";
import { Sidebar } from "./components/Sidebar";
import { AskAgentPage } from "./pages/AskAgent";
import { ErrorsPage } from "./pages/Errors";
import { MatchesPage } from "./pages/Matches";
import { OverviewPage } from "./pages/Overview";
import type { ReconcileResponse } from "./types";

type View = "overview" | "matches" | "errors" | "ask";

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
      setError(err instanceof Error ? err.message : "Upload failed.");
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
      setError(err instanceof Error ? err.message : "Folder run failed.");
      throw err;
    } finally {
      setRunning(false);
    }
  }

  function handleFocusRecord(recordId: string) {
    setFocusedRecordId(recordId);
    if (data?.exceptions.some((row) => row.record_id === recordId)) {
      setView("errors");
    } else {
      setView("matches");
    }
  }

  const matches = data?.matches ?? [];
  const exceptions = data?.exceptions ?? [];

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <Sidebar
        currentView={view}
        onNavigate={setView}
        exceptionCount={data?.kpis.exception_count ?? 0}
        isRunning={running}
      />

      <main className="main-content">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 bg-[#f1f5f9]/80 backdrop-blur-xl border-b border-[#e2e8f0]">
          <div className="flex items-center justify-between px-6 lg:px-8 py-4">
            <div>
              <h1 className="text-lg font-bold text-[#0f172a]">
                {view === "overview" && "Dashboard Overview"}
                {view === "matches" && "Matches & Exceptions"}
                {view === "errors" && "Error Analysis"}
                {view === "ask" && "AI Agent"}
              </h1>
              <p className="text-xs text-[#64748b] mt-0.5">
                {view === "overview" && "KPIs, accuracy metrics, and reconciliation summary"}
                {view === "matches" && "Matched records and exception list with audit trail"}
                {view === "errors" && "What went wrong, where, and why — per exception"}
                {view === "ask" && "Grounded Q&A over reconciliation data"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {error && (
                <span className="badge badge-red max-w-[300px] truncate">{error}</span>
              )}
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={running}
                className="btn-primary"
              >
                {running ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Run Reconciliation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="content-area">
          {loading && (
            <div className="card p-12 text-center">
              <div className="inline-flex items-center gap-3 text-[#64748b]">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading latest reconciliation run...
              </div>
            </div>
          )}

          {!loading && !data && (
            <div className="space-y-6 animate-fadeIn">
              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleRunFromFolder} busy={running} />
              <div className="card p-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#f1f5f9] flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-[#64748b]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f172a]">No reconciliation data yet</h3>
                    <p className="mt-1 text-sm text-[#64748b]">
                      Click <strong>Run Reconciliation</strong> to generate synthetic data and process the full batch,
                      or upload your own files above.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading && data && (
            <div className="animate-fadeIn">
              {view === "overview" && (
                <div className="space-y-6">
                  <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleRunFromFolder} busy={running} />
                  <OverviewPage kpis={data.kpis} accuracy={data.accuracy} onRun={handleRun} running={running} />
                </div>
              )}
              {view === "matches" && (
                <MatchesPage
                  matches={matches}
                  exceptions={exceptions}
                  focusedRecordId={focusedRecordId}
                  onFocusRecord={handleFocusRecord}
                />
              )}
              {view === "errors" && (
                <ErrorsPage exceptions={exceptions} onFocusRecord={handleFocusRecord} />
              )}
              {view === "ask" && (
                <AskAgentPage onFocusRecord={handleFocusRecord} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
