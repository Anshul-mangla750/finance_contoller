import { useEffect, useState } from "react";
import { loadLatestRun, runFolderReconciliation, runReconciliation, uploadReconciliation } from "./api";
import { ReconciliationIngress } from "./components/ReconciliationIngress";
import { Sidebar } from "./components/Sidebar";
import { AskAgentPage } from "./pages/AskAgent";
import { ErrorsPage } from "./pages/Errors";
import { MatchesPage } from "./pages/Matches";
import { OverviewPage } from "./pages/Overview";
import type { ReconcileResponse, View } from "./types";

const VIEW_COPY: Record<View, { title: string; subtitle: string }> = {
  overview: {
    title: "Financial Control Center",
    subtitle: "Real-time visibility, automated matching, cash position oversight, and exception management.",
  },
  matches: {
    title: "Reconciliation Matching Graph",
    subtitle: "Inspect multi-layer deterministic matches, composite payment links, and audit evidence.",
  },
  errors: {
    title: "Exception Resolution Queue",
    subtitle: "Audit unresolved ledger discrepancies, inspect root cause evidence, and record approvals.",
  },
  ask: {
    title: "Financial Audit Intelligence",
    subtitle: "Query live reconciliation batch records, cash flows, and exception evidence with full citations.",
  },
};

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<ReconcileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const latest = await loadLatestRun();
        setData(latest);
      } catch {
        // No previous run yet.
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
      setError(err instanceof Error ? err.message : "Reconciliation execution failed.");
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
      setError(err instanceof Error ? err.message : "Upload processing failed.");
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
      setError(err instanceof Error ? err.message : "Folder execution failed.");
      throw err;
    } finally {
      setRunning(false);
    }
  }

  function navigateTo(nextView: View) {
    setView(nextView);
    setIsSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleFocusRecord(recordId: string) {
    setFocusedRecordId(recordId);
    const inExceptions = data?.exceptions.some((e) => e.record_id === recordId) ?? false;
    navigateTo(inExceptions ? "errors" : "matches");
  }

  const currentCopy = VIEW_COPY[view];

  return (
    <div className="app-shell">
      <Sidebar
        currentView={view}
        onNavigate={navigateTo}
        exceptionCount={data?.kpis.exception_count ?? 0}
        isRunning={running}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="app-main">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-[#1f2736] bg-[#0e121a]">
          <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="mobile-nav-toggle lg:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Open navigation menu"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="hero-kicker">FINANCIAL OPERATIONS ENGINE</span>
                    {data?.kpis.checksum_ok && (
                      <span className="pill pill-green text-[10px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        AUDIT CHECKSUM OK
                      </span>
                    )}
                  </div>
                  <h1 className="mt-1 text-lg font-bold text-white sm:text-xl tracking-tight">
                    {currentCopy.title}
                  </h1>
                </div>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                {data && (
                  <div className="flex items-center gap-2 rounded-md border border-[#2b364a] bg-[#131822] px-3 py-1.5 text-xs text-slate-300">
                    <span className="mono font-semibold text-white">{data.kpis.records_processed.toLocaleString()}</span>
                    <span className="text-slate-500">records</span>
                    <span className="text-slate-600">|</span>
                    <span className="mono font-semibold text-emerald-400">{Math.round(data.kpis.match_rate * 100)}%</span>
                    <span className="text-slate-500">matched</span>
                    <span className="text-slate-600">|</span>
                    <span className="mono font-semibold text-amber-400">{data.kpis.exception_count}</span>
                    <span className="text-slate-500">exceptions</span>
                  </div>
                )}
                {error && <span className="pill pill-red max-w-[280px] truncate">{error}</span>}
                <button onClick={() => void handleRun()} disabled={running} className="btn-primary">
                  {running ? "Executing Run..." : "Run Reconciliation"}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f2736]/60 pt-2 text-xs">
              <p className="text-slate-400 hidden sm:block">{currentCopy.subtitle}</p>

              {/* Step Progress Rail */}
              <div className="process-rail ml-auto">
                {[
                  { step: "1", label: "Observe", active: true },
                  { step: "2", label: "Understand", active: true },
                  { step: "3", label: "Decide", active: view !== "overview" || Boolean(data) },
                  { step: "4", label: "Act", active: Boolean(data?.exceptions.length) },
                  { step: "5", label: "Verify", active: Boolean(data?.kpis.checksum_ok) },
                ].map((item) => (
                  <span key={item.label} className={`process-pill ${item.active ? "process-pill-active" : ""}`}>
                    <span className="mono text-[10px] opacity-70">{item.step}.</span>
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="page-pad">
          {loading && (
            <div className="space-y-4 anim-fade-in">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="surface h-24 rounded-lg anim-shimmer" />
                ))}
              </div>
              <div className="surface h-64 rounded-lg anim-shimmer" />
            </div>
          )}

          {!loading && !data && view === "overview" && (
            <div className="space-y-6 anim-fade-up">
              <div className="hero-panel p-6 lg:p-8">
                <div className="max-w-3xl">
                  <div className="hero-kicker">GET STARTED</div>
                  <h2 className="hero-title mt-3">
                    Enterprise Financial Operations & Audit Control Platform
                  </h2>
                  <p className="hero-sub">
                    Execute automated multi-source reconciliation across bank statements, general ledgers, AP bills, and AR invoices. Audit matching evidence, investigate exception risks, and route decisioning through human-in-the-loop controls.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => void handleRun()} disabled={running} className="btn-primary">
                      {running ? "Initializing Batch..." : "Run Reconciliation Batch"}
                    </button>
                    <button onClick={() => navigateTo("ask")} className="btn-outline">
                      Open Audit Intelligence
                    </button>
                  </div>
                </div>
              </div>

              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleFolderRun} busy={running} />
            </div>
          )}

          {!loading && !data && view !== "overview" && (
            <div className="surface p-12 text-center anim-fade-up">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[#2b364a] bg-[#171e2b] text-slate-300 font-mono">
                {view === "matches" ? "GRAPH" : view === "errors" ? "QUEUE" : "QUERY"}
              </div>
              <h3 className="text-base font-semibold text-white">No active reconciliation run</h3>
              <p className="mt-1 text-xs text-slate-400">Run a reconciliation batch to populate data for this view.</p>
              <button onClick={() => navigateTo("overview")} className="btn-primary mt-4">
                Return to Control Center
              </button>
            </div>
          )}

          {!loading && data && view === "overview" && (
            <div className="space-y-6 anim-fade-up">
              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleFolderRun} busy={running} />
              <OverviewPage
                kpis={data.kpis}
                accuracy={data.accuracy}
                matches={data.matches}
                exceptions={data.exceptions}
                onRun={handleRun}
                onOpenMatches={() => navigateTo("matches")}
                onOpenErrors={() => navigateTo("errors")}
                onOpenAsk={() => navigateTo("ask")}
                running={running}
              />
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
