import { useMemo } from "react";
import { ConfidenceChart } from "../components/ConfidenceChart";
import { KPICards } from "../components/KPICards";
import type { AccuracyReport, ExceptionRow, Kpis, MatchRow } from "../types";

type Props = {
  kpis: Kpis;
  accuracy: AccuracyReport;
  matches: MatchRow[];
  exceptions: ExceptionRow[];
  onRun: () => void;
  onOpenMatches: () => void;
  onOpenErrors: () => void;
  onOpenAsk: () => void;
  running: boolean;
};

type RiskTone = "green" | "amber" | "red" | "blue";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function severityLabel(score: number) {
  if (score >= 80) return { label: "CRITICAL", tone: "red" as const };
  if (score >= 60) return { label: "HIGH", tone: "amber" as const };
  if (score >= 35) return { label: "MEDIUM", tone: "blue" as const };
  return { label: "LOW", tone: "green" as const };
}

function toneClass(tone: RiskTone) {
  return tone === "green" ? "pill-green" : tone === "amber" ? "pill-amber" : tone === "red" ? "pill-red" : "pill-blue";
}

export function OverviewPage({ kpis, accuracy, matches, exceptions, onRun, onOpenMatches, onOpenErrors, onOpenAsk, running }: Props) {
  const insight = useMemo(() => {
    const totalRisk = Math.min(100, Math.round((exceptions.length / Math.max(1, kpis.records_processed)) * 160));
    const cashRiskScore = kpis.cash_position < 0 ? Math.min(100, 60 + Math.round(Math.abs(kpis.cash_position) / 1000)) : kpis.cash_position < 10000 ? 48 : 18;
    const settlementIssues = exceptions.filter((e) => ["amount_mismatch", "date_out_of_tolerance", "missing_counterpart"].includes(e.reason_category)).length;
    const paymentIssues = exceptions.filter((e) => ["duplicate_suspected", "missing_counterpart"].includes(e.reason_category)).length;
    const taxIssues = exceptions.filter((e) => /tax/i.test(`${e.explanation} ${e.suggested_action} ${e.reason_category}`)).length;

    const agents = [
      {
        name: "Reconciliation Agent",
        status: kpis.checksum_ok && kpis.match_rate >= 0.9 ? "Stable" : "Needs attention",
        tone: (kpis.checksum_ok && kpis.match_rate >= 0.9 ? "green" : "amber") as RiskTone,
        detail: `${kpis.records_processed.toLocaleString()} records scanned and ${percent(kpis.match_rate)} matched.`,
        confidence: Math.round(Math.max(kpis.precision, kpis.recall) * 100),
      },
      {
        name: "Settlement Intelligence Agent",
        status: settlementIssues > 0 ? "Investigating" : "Monitoring",
        tone: (settlementIssues > 0 ? "amber" : "green") as RiskTone,
        detail: `${settlementIssues} settlement-related exceptions surfaced in the current run.`,
        confidence: Math.max(55, 100 - settlementIssues * 10),
      },
      {
        name: "Cash Flow Agent",
        status: kpis.cash_position < 0 ? "Cash risk" : kpis.cash_position < 10000 ? "Watchlist" : "Healthy",
        tone: (kpis.cash_position < 0 ? "red" : kpis.cash_position < 10000 ? "amber" : "green") as RiskTone,
        detail: `${kpis.cash_position < 0 ? "Negative" : "Positive"} cash position of ${currency(Math.abs(kpis.cash_position))}.`,
        confidence: cashRiskScore >= 80 ? 90 : 72,
      },
      {
        name: "Tax Intelligence Agent",
        status: taxIssues > 0 ? "Review required" : "Ready",
        tone: (taxIssues > 0 ? "amber" : "blue") as RiskTone,
        detail: `${taxIssues} tax-sensitive items found in the current evidence trail.`,
        confidence: taxIssues > 0 ? 78 : 86,
      },
    ];

    const radar = [
      {
        label: "Payment Risk",
        score: Math.min(100, paymentIssues * 28 + Math.round((1 - kpis.precision) * 100 * 0.45)),
        reason: paymentIssues > 0 ? `${paymentIssues} duplicate or missing-payment signals.` : "No payment anomaly cluster detected.",
        action: "Inspect duplicate or missing-payment candidates.",
      },
      {
        label: "Settlement Risk",
        score: Math.min(100, settlementIssues * 24 + (kpis.checksum_ok ? 8 : 34)),
        reason: kpis.checksum_ok ? "Checksum is green, but settlement mismatches still need review." : "Checksum failed and settlement variance increased.",
        action: "Open settlement discrepancy queue.",
      },
      {
        label: "Cash Risk",
        score: cashRiskScore,
        reason: kpis.cash_position < 0 ? "Current cash position is below zero." : "Cash remains positive, but runway needs monitoring.",
        action: "Review the forecast and upcoming obligations.",
      },
      {
        label: "Tax Risk",
        score: Math.min(100, taxIssues * 30 + Math.round(exceptions.length * 0.4)),
        reason: taxIssues > 0 ? "Tax-sensitive evidence requires classification review." : "No explicit tax exception cluster in the current batch.",
        action: "Run tax-line review on flagged items.",
      },
      {
        label: "Operational Risk",
        score: totalRisk,
        reason: `${exceptions.length} unresolved exceptions are waiting for resolution.`,
        action: "Move exceptions through approval.",
      },
    ];

    const approvalQueue = exceptions.slice(0, 3).map((exc) => ({
      record: `${exc.source_type}:${exc.record_id}`,
      title: exc.suggested_action,
      reason: exc.explanation,
      confidence: exc.best_candidate_confidence != null ? Math.round(exc.best_candidate_confidence * 100) : Math.round(kpis.precision * 100),
      candidate: exc.best_candidate_id ? `${exc.best_candidate_type}:${exc.best_candidate_id}` : "No candidate yet",
      status: exc.status.replace(/_/g, " "),
    }));

    const recentEvents = [
      {
        time: "Live",
        agent: "Reconciliation Agent",
        action: `${kpis.records_processed} records processed`,
        status: kpis.match_rate >= 0.9 ? "Balanced" : "Review",
      },
      {
        time: "Live",
        agent: "Settlement Intelligence Agent",
        action: `${settlementIssues} settlement issues detected`,
        status: kpis.checksum_ok ? "Verified" : "Investigating",
      },
      {
        time: "Live",
        agent: "Exception Resolution Agent",
        action: `${exceptions.length} approvals waiting`,
        status: exceptions.length > 0 ? "Awaiting approval" : "Clear",
      },
      {
        time: "Live",
        agent: "AI Finance Copilot",
        action: "Ready for grounded, cited questions",
        status: "Online",
      },
    ];

    return { agents, radar, approvalQueue, recentEvents };
  }, [exceptions, kpis.cash_position, kpis.checksum_ok, kpis.match_rate, kpis.precision, kpis.records_processed, kpis.recall]);

  return (
    <div className="space-y-6">
      <div className="hero-panel p-6 lg:p-8 anim-fade-up">
        <div className="grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="relative z-10">
            <div className="hero-kicker">Finance Command Center</div>
            <h2 className="hero-title mt-4">
              An agentic surface for reconciliation, settlement review, cash monitoring, tax review, and human-approved finance actions.
            </h2>
            <p className="hero-sub">
              The dashboard turns the current reconciliation run into an operating picture: it surfaces exceptions, explains evidence, and routes sensitive actions through approval instead of automatic execution.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={onRun} disabled={running} className="btn-green">
                {running ? "Running..." : "Run reconciliation"}
              </button>
              <button onClick={onOpenErrors} className="btn-outline">
                Review exceptions
              </button>
              <button onClick={onOpenAsk} className="btn-ghost">
                Ask finance copilot
              </button>
            </div>
            <div className="mt-7 process-rail">
              {[
                { label: "Observe", active: true },
                { label: "Understand", active: true },
                { label: "Decide", active: accuracy.available },
                { label: "Act", active: exceptions.length > 0 },
                { label: "Verify", active: kpis.checksum_ok },
              ].map((step) => (
                <span key={step.label} className={`process-pill ${step.active ? "process-pill-active" : ""}`}>
                  <span className={`badge-dot ${step.active ? "bg-emerald-300" : "bg-slate-500"}`} />
                  {step.label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative z-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Financial Health</div>
                  <div className="mt-1 text-xl font-bold text-white">Operational signal</div>
                </div>
                <span className={`pill ${kpis.checksum_ok ? "pill-green" : "pill-red"}`}>{kpis.checksum_ok ? "Verified" : "Needs review"}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Available balance</div>
                  <div className="mt-1 text-lg font-bold text-white">{currency(kpis.cash_position)}</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Reconciliation rate</div>
                  <div className="mt-1 text-lg font-bold text-white">{percent(kpis.match_rate)}</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Unresolved exceptions</div>
                  <div className="mt-1 text-lg font-bold text-white">{kpis.exception_count.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/5 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</div>
                  <div className="mt-1 text-lg font-bold text-white">{Math.round(kpis.f1 * 100)}%</div>
                </div>
              </div>
            </div>

            <div className="surface p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Agent status</div>
              <div className="mt-3 space-y-3">
                {insight.agents.map((agent) => (
                  <div key={agent.name} className="rounded-2xl border border-white/5 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{agent.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{agent.detail}</div>
                      </div>
                      <span className={`pill ${toneClass(agent.tone)}`}>{agent.status}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="bar-track flex-1">
                        <div className={`bar-fill ${agent.tone === "green" ? "bg-emerald-400" : agent.tone === "amber" ? "bg-amber-400" : agent.tone === "red" ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${agent.confidence}%` }} />
                      </div>
                      <span className="mono text-[11px] text-slate-400">{agent.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="surface p-6 anim-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="section-head">
          <div>
            <div className="hero-kicker">Financial Health</div>
            <h3 className="section-title mt-3">Current batch signal</h3>
            <p className="section-sub">The values below come directly from the latest reconciliation run.</p>
          </div>
        </div>
        <KPICards kpis={kpis} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="surface p-6 anim-fade-up" style={{ animationDelay: "0.08s" }}>
            <div className="section-head">
              <div>
                <div className="hero-kicker">Active Finance Agents</div>
                <h3 className="section-title mt-3">Operational layer</h3>
                <p className="section-sub">Each agent interprets the current batch and routes human review when needed.</p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {insight.agents.map((agent, index) => (
                <div key={agent.name} className="agent-card anim-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
                  <div className="flex items-start gap-4">
                    <div className="agent-sigil">
                      <div className={`badge-dot ${agent.tone === "green" ? "bg-emerald-300" : agent.tone === "amber" ? "bg-amber-300" : agent.tone === "red" ? "bg-rose-300" : "bg-sky-300"}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-bold text-white">{agent.name}</div>
                          <div className="mt-1 text-sm text-slate-400">{agent.detail}</div>
                        </div>
                        <span className={`pill ${toneClass(agent.tone)}`}>{agent.status}</span>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                        <span>Confidence</span>
                        <span className="mono text-slate-200">{agent.confidence}%</span>
                      </div>
                      <div className="mt-2 bar-track">
                        <div className={`bar-fill ${agent.tone === "green" ? "bg-emerald-400" : agent.tone === "amber" ? "bg-amber-400" : agent.tone === "red" ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${agent.confidence}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface p-6 anim-fade-up" style={{ animationDelay: "0.12s" }}>
            <div className="section-head">
              <div>
                <div className="hero-kicker">Actions Awaiting Approval</div>
                <h3 className="section-title mt-3">Human-in-the-loop queue</h3>
                <p className="section-sub">Sensitive items stay in review until a human confirms the action.</p>
              </div>
              <button onClick={onOpenErrors} className="btn-outline btn-xs">
                Open queue
              </button>
            </div>

            <div className="space-y-3">
              {insight.approvalQueue.length > 0 ? (
                insight.approvalQueue.map((item) => (
                  <div key={item.record} className="approval-card">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="pill pill-slate mono">{item.record}</span>
                          <span className="pill pill-amber">{item.status}</span>
                        </div>
                        <div className="text-base font-semibold text-white">{item.title}</div>
                        <p className="max-w-3xl text-sm leading-6 text-slate-400">{item.reason}</p>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                          <span className="rounded-full border border-white/5 bg-white/5 px-2.5 py-1">Confidence: {item.confidence}%</span>
                          <span className="rounded-full border border-white/5 bg-white/5 px-2.5 py-1">Evidence: {item.candidate}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button onClick={onOpenErrors} className="btn-green btn-xs">
                          Review
                        </button>
                        <button onClick={onOpenMatches} className="btn-outline btn-xs">
                          Inspect evidence
                        </button>
                        <button onClick={onOpenAsk} className="btn-ghost btn-xs">
                          Ask copilot
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-6 text-sm text-slate-400">
                  No approvals are waiting right now. The queue will populate as new exceptions arrive.
                </div>
              )}
            </div>
          </div>

          <div className="surface p-6 anim-fade-up" style={{ animationDelay: "0.16s" }}>
            <div className="section-head">
              <div>
                <div className="hero-kicker">Agent Activity</div>
                <h3 className="section-title mt-3">Live operational timeline</h3>
                <p className="section-sub">A compact log of what the agents are doing in the current batch.</p>
              </div>
            </div>
            <div className="space-y-3">
              {insight.recentEvents.map((event, index) => (
                <div key={`${event.agent}-${index}`} className="timeline-card">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-[11px] font-bold text-slate-200">
                        {event.time}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{event.agent}</div>
                        <div className="mt-1 text-sm text-slate-400">{event.action}</div>
                      </div>
                    </div>
                    <span className="pill pill-blue">{event.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface p-6 anim-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="section-head">
              <div>
                <div className="hero-kicker">Financial Risk Radar</div>
                <h3 className="section-title mt-3">Risk monitoring</h3>
                <p className="section-sub">A quick read on where the run needs attention next.</p>
              </div>
            </div>
            <div className="space-y-3">
              {insight.radar.map((item) => {
                const severity = severityLabel(item.score);
                return (
                  <div key={item.label} className="risk-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.reason}</div>
                      </div>
                      <span className={`pill ${toneClass(severity.tone)}`}>{severity.label}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="bar-track flex-1">
                        <div className={`bar-fill ${severity.tone === "green" ? "bg-emerald-400" : severity.tone === "amber" ? "bg-amber-400" : severity.tone === "red" ? "bg-rose-400" : "bg-sky-400"}`} style={{ width: `${item.score}%` }} />
                      </div>
                      <span className="mono text-xs text-slate-300">{item.score}</span>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">{item.action}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <ConfidenceChart calibration={accuracy.calibration_table} />
        </div>
      </div>
    </div>
  );
}
