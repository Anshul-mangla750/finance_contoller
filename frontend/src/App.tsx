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
      } catch {
        // no data yet
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
      setError(err instanceof Error ? err.message : "Failed.");
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

  async function handleFolderRun(inputDir: string) {
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

  function navigateTo(v: View) {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleFocusRecord(recordId: string) {
    setFocusedRecordId(recordId);
    const inExceptions = data?.exceptions.some((e) => e.record_id === recordId) ?? false;
    navigateTo(inExceptions ? "errors" : "matches");
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <Sidebar
        currentView={view}
        onNavigate={navigateTo}
        exceptionCount={data?.kpis.exception_count ?? 0}
        isRunning={running}
      />

      <main className="app-main">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 glass border-b border-gray-200/60">
          <div className="flex items-center justify-between px-6 lg:px-8 py-3.5">
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {view === "overview" && "Dashboard Overview"}
                {view === "matches" && "Matches & Exceptions"}
                {view === "errors" && "Error Analysis"}
                {view === "ask" && "AI Agent"}
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {view === "overview" && "Metrics, accuracy, and reconciliation summary"}
                {view === "matches" && "Matched records and exception audit trail"}
                {view === "errors" && "What went wrong, where, and why — per exception"}
                {view === "ask" && "Natural-language Q&A over your reconciliation data"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {data && (
                <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="font-mono">{data.kpis.records_processed}</span> records ·
                  <span className="font-mono text-emerald-600 font-semibold">{Math.round(data.kpis.match_rate * 100)}%</span> matched ·
                  <span className="font-mono text-red-500 font-semibold">{data.kpis.exception_count}</span> exceptions
                </div>
              )}
              {error && <span className="pill pill-red max-w-[250px] truncate">{error}</span>}
              <button onClick={() => void handleRun()} disabled={running} className="btn-green">
                {running ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Running...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>Run Reconciliation</>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content Area — each page renders its OWN content */}
        <div className="page-pad">

          {/* LOADING */}
          {loading && (
            <div className="space-y-4 anim-fade-in">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="solid p-5 anim-shimmer h-28 rounded-2xl" />
                ))}
              </div>
              <div className="solid p-8 anim-shimmer h-64 rounded-2xl" />
            </div>
          )}

          {/* NO DATA */}
          {!loading && !data && view === "overview" && (
            <div className="anim-fade-up space-y-6">
              <div className="elevated p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-4 anim-bounce-in">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Welcome to AI Finance Controller</h2>
                <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">Click <strong>Run Reconciliation</strong> above to generate synthetic data and process the full batch end-to-end.</p>
              </div>
              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleFolderRun} busy={running} />
            </div>
          )}

          {/* NO DATA — other pages */}
          {!loading && !data && view !== "overview" && (
            <div className="anim-fade-up">
              <div className="solid p-12 text-center">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-lg font-bold text-gray-900">No data yet</h3>
                <p className="mt-2 text-sm text-gray-500">Run a reconciliation first from the Overview page.</p>
                <button onClick={() => navigateTo("overview")} className="btn-green mt-4">Go to Overview</button>
              </div>
            </div>
          )}

          {/* HAS DATA — render based on current view */}
          {!loading && data && view === "overview" && (
            <div className="space-y-6 anim-fade-up">
              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleFolderRun} busy={running} />
              <OverviewPage kpis={data.kpis} accuracy={data.accuracy} onRun={handleRun} running={running} />
            </div>
          )}

          {!loading && data && view === "matches" && (
            <div className="anim-fade-up">
              <MatchesPage
                matches={data.matches}
                exceptions={data.exceptions}
                focusedRecordId={focusedRecordId}
                onFocusRecord={handleFocusRecord}
              />
            </div>
          )}

          {!loading && data && view === "errors" && (
            <div className="anim-fade-up">
              <ErrorsPage exceptions={data.exceptions} onFocusRecord={handleFocusRecord} />
            </div>
          )}

          {!loading && data && view === "ask" && (
            <div className="anim-fade-up">
              <AskAgentPage onFocusRecord={handleFocusRecord} />
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
