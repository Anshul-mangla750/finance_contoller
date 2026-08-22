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
    title: "Finance Command Center",
    subtitle: "Observe, understand, decide, act, and verify across cash, settlement, and reconciliation operations.",
  },
  matches: {
    title: "Matching Graph",
    subtitle: "Inspect deterministic matches, layered fallbacks, and the evidence behind each link.",
  },
  errors: {
    title: "Exception Resolution",
    subtitle: "Investigate unresolved records, review explanations, and move items through approval.",
  },
  ask: {
    title: "AI Finance Copilot",
    subtitle: "Ask grounded questions over the current reconciliation run with cited records.",
  },
};

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

  function navigateTo(nextView: View) {
    setView(nextView);
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
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-[24rem] w-[24rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute right-[-7rem] top-[6rem] h-[22rem] w-[22rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-[18%] h-[28rem] w-[28rem] rounded-full bg-amber-500/8 blur-3xl" />
      </div>

      <Sidebar
        currentView={view}
        onNavigate={navigateTo}
        exceptionCount={data?.kpis.exception_count ?? 0}
        isRunning={running}
      />

      <main className="app-main">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/72 backdrop-blur-xl">
          <div className="flex flex-col gap-4 px-5 py-4 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="hero-kicker">Agentic Finance Platform</div>
                <h1 className="mt-3 text-xl font-extrabold tracking-tight text-white lg:text-2xl" style={{ fontFamily: "Space Grotesk, Inter, system-ui, sans-serif" }}>
                  {currentCopy.title}
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-400">
                  {currentCopy.subtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {data && (
                  <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] text-slate-300 md:flex md:items-center md:gap-2">
                    <span className="mono text-slate-100">{data.kpis.records_processed}</span>
                    records
                    <span className="text-slate-500">|</span>
                    <span className="mono text-emerald-300">{Math.round(data.kpis.match_rate * 100)}%</span>
                    matched
                    <span className="text-slate-500">|</span>
                    <span className="mono text-rose-300">{data.kpis.exception_count}</span>
                    exceptions
                  </div>
                )}
                {error && <span className="pill pill-red max-w-[280px] truncate">{error}</span>}
                <button onClick={() => void handleRun()} disabled={running} className="btn-green">
                  {running ? "Running..." : "Run Reconciliation"}
                </button>
              </div>
            </div>

            <div className="process-rail">
              {[
                { label: "Observe", active: true },
                { label: "Understand", active: true },
                { label: "Decide", active: view !== "overview" || Boolean(data) },
                { label: "Act", active: Boolean(data?.exceptions.length) },
                { label: "Verify", active: Boolean(data?.kpis.checksum_ok) },
              ].map((step) => (
                <span key={step.label} className={`process-pill ${step.active ? "process-pill-active" : ""}`}>
                  <span className={`badge-dot ${step.active ? "bg-emerald-300" : "bg-slate-500"}`} />
                  {step.label}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="page-pad">
          {loading && (
            <div className="space-y-4 anim-fade-in">
              <div className="grid gap-4 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="solid h-28 rounded-[24px] anim-shimmer" />
                ))}
              </div>
              <div className="solid h-72 rounded-[28px] anim-shimmer" />
            </div>
          )}

          {!loading && !data && view === "overview" && (
            <div className="space-y-6 anim-fade-up">
              <div className="hero-panel p-7 lg:p-10">
                <div className="relative z-10 max-w-3xl">
                  <div className="hero-kicker">Finance Command Center</div>
                  <h2 className="hero-title mt-4">
                    A live operating surface for reconciliation, settlement review, cash risk, and AI-assisted finance actions.
                  </h2>
                  <p className="hero-sub">
                    Start a reconciliation run to populate the command center, open the copilot for grounded questions, or upload your own bank, ledger, invoice, and bill files.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => void handleRun()} disabled={running} className="btn-green">
                      {running ? "Preparing..." : "Launch Command Center"}
                    </button>
                    <button onClick={() => navigateTo("ask")} className="btn-outline">
                      Open Copilot
                    </button>
                  </div>
                </div>
              </div>

              <ReconciliationIngress onUpload={handleUpload} onRunFromFolder={handleFolderRun} busy={running} />
            </div>
          )}

          {!loading && !data && view !== "overview" && (
            <div className="solid p-12 text-center anim-fade-up">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/5 text-3xl">
                {view === "matches" ? "↔" : view === "errors" ? "!" : "⌁"}
              </div>
              <h3 className="text-lg font-bold text-white">No live run yet</h3>
              <p className="mt-2 text-sm text-slate-400">Run reconciliation from the Command Center to unlock this view.</p>
              <button onClick={() => navigateTo("overview")} className="btn-green mt-5">
                Go to Command Center
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
