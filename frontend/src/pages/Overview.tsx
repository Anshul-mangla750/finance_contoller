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
        name: "Reconciliation Engine",
        status: kpis.checksum_ok && kpis.match_rate >= 0.9 ? "Stable" : "Attention Needed",
        tone: (kpis.checksum_ok && kpis.match_rate >= 0.9 ? "green" : "amber") as RiskTone,
        detail: `${kpis.records_processed.toLocaleString()} records processed with ${percent(kpis.match_rate)} match rate.`,
        confidence: Math.round(Math.max(kpis.precision, kpis.recall) * 100),
      },
      {
        name: "Settlement Monitor",
        status: settlementIssues > 0 ? "Discrepancies Flagged" : "Balanced",
        tone: (settlementIssues > 0 ? "amber" : "green") as RiskTone,
        detail: `${settlementIssues} settlement exceptions surfaced in latest batch.`,
        confidence: Math.max(55, 100 - settlementIssues * 10),
      },
      {
        name: "Liquidity Agent",
        status: kpis.cash_position < 0 ? "Deficit Risk" : kpis.cash_position < 10000 ? "Watchlist" : "Solvent",
        tone: (kpis.cash_position < 0 ? "red" : kpis.cash_position < 10000 ? "amber" : "green") as RiskTone,
        detail: `${kpis.cash_position < 0 ? "Negative balance" : "Positive position"} of ${currency(Math.abs(kpis.cash_position))}.`,
        confidence: cashRiskScore >= 80 ? 90 : 72,
      },
      {
        name: "Compliance & Tax Audit",
        status: taxIssues > 0 ? "Review Required" : "Compliant",
        tone: (taxIssues > 0 ? "amber" : "blue") as RiskTone,
        detail: `${taxIssues} tax-sensitive line items identified for verification.`,
        confidence: taxIssues > 0 ? 78 : 86,
      },
    ];

    const radar = [
      {
        label: "Payment Variance Risk",
        score: Math.min(100, paymentIssues * 28 + Math.round((1 - kpis.precision) * 100 * 0.45)),
        reason: paymentIssues > 0 ? `${paymentIssues} duplicate or uncollected payment anomalies.` : "No payment anomaly cluster detected.",
        action: "Inspect missing payment records",
      },
      {
        label: "Settlement Risk",
        score: Math.min(100, settlementIssues * 24 + (kpis.checksum_ok ? 8 : 34)),
        reason: kpis.checksum_ok ? "Arithmetic checksum green; settlement variances pending review." : "Checksum failure detected; variance expanded.",
        action: "Review settlement queue",
      },
      {
        label: "Cash Runway Risk",
        score: cashRiskScore,
        reason: kpis.cash_position < 0 ? "Net liquidity is below zero threshold." : "Cash reserve positive; monitoring ongoing liabilities.",
        action: "Monitor obligations timeline",
      },
      {
        label: "Tax Classification Risk",
        score: Math.min(100, taxIssues * 30 + Math.round(exceptions.length * 0.4)),
        reason: taxIssues > 0 ? "Tax deduction evidence requires auditor classification." : "No tax classification exceptions in current batch.",
        action: "Perform tax line review",
      },
      {
        label: "Operational Discrepancy Risk",
        score: totalRisk,
        reason: `${exceptions.length} open exception items awaiting resolution.`,
        action: "Process exception queue",
      },
    ];

    const approvalQueue = exceptions.slice(0, 3).map((exc) => ({
      record: `${exc.source_type}:${exc.record_id}`,
      title: exc.suggested_action,
      reason: exc.explanation,
      confidence: exc.best_candidate_confidence != null ? Math.round(exc.best_candidate_confidence * 100) : Math.round(kpis.precision * 100),
      candidate: exc.best_candidate_id ? `${exc.best_candidate_type}:${exc.best_candidate_id}` : "No candidate",
      status: exc.status.replace(/_/g, " "),
    }));

    const recentEvents = [
      {
        time: "CURRENT",
        agent: "Reconciliation Engine",
        action: `Processed batch of ${kpis.records_processed} ledger entries`,
        status: kpis.match_rate >= 0.9 ? "BALANCED" : "REVIEW",
      },
      {
        time: "CURRENT",
        agent: "Settlement Monitor",
        action: `Surfaced ${settlementIssues} settlement discrepancies`,
        status: kpis.checksum_ok ? "VERIFIED" : "INVESTIGATING",
      },
      {
        time: "CURRENT",
        agent: "Exception Resolution Flow",
        action: `${exceptions.length} items queued for auditor review`,
        status: exceptions.length > 0 ? "PENDING REVIEW" : "CLEAR",
      },
      {
        time: "CURRENT",
        agent: "Audit Intelligence",
        action: "Grounded retrieval index active for live batch queries",
        status: "ACTIVE",
      },
    ];

    return { agents, radar, approvalQueue, recentEvents };
  }, [exceptions, kpis.cash_position, kpis.checksum_ok, kpis.match_rate, kpis.precision, kpis.records_processed, kpis.recall]);

  return (
    <div className="space-y-6">
      {/* Executive Command Center Summary Panel */}
      <div className="hero-panel p-6 lg:p-8 anim-fade-up">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="hero-kicker">CONTROL CENTER</span>
              <span className="pill pill-slate text-[10px]">BATCH ID #REC-2026-823</span>
            </div>
            <h2 className="hero-title mt-3">
              Institutional Financial Control & Reconciliation Platform
            </h2>
            <p className="hero-sub">
              Automated deterministic matching, cross-ledger checksum audit, settlement variance tracking, and human-in-the-loop exception approval.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button onClick={onRun} disabled={running} className="btn-primary">
                {running ? "Processing Batch..." : "Run Reconciliation Batch"}
              </button>
              <button onClick={onOpenErrors} className="btn-outline">
                Review Exceptions ({exceptions.length})
              </button>
              <button onClick={onOpenAsk} className="btn-ghost">
                Open Audit Copilot
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">BATCH INTEGRITY</span>
                <span className={`pill ${kpis.checksum_ok ? "pill-green" : "pill-red"}`}>
                  {kpis.checksum_ok ? "CHECKSUM PASSED" : "CHECKSUM FAILED"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-[#1f2736] bg-[#0e121a] p-2.5">
                  <div className="text-[10px] uppercase text-slate-400">Available Liquidity</div>
                  <div className="mt-1 font-mono text-base font-bold text-white">{currency(kpis.cash_position)}</div>
                </div>
                <div className="rounded border border-[#1f2736] bg-[#0e121a] p-2.5">
                  <div className="text-[10px] uppercase text-slate-400">Reconciliation Rate</div>
                  <div className="mt-1 font-mono text-base font-bold text-emerald-400">{percent(kpis.match_rate)}</div>
                </div>
                <div className="rounded border border-[#1f2736] bg-[#0e121a] p-2.5">
                  <div className="text-[10px] uppercase text-slate-400">Open Exceptions</div>
                  <div className="mt-1 font-mono text-base font-bold text-amber-400">{kpis.exception_count.toLocaleString()}</div>
                </div>
                <div className="rounded border border-[#1f2736] bg-[#0e121a] p-2.5">
                  <div className="text-[10px] uppercase text-slate-400">Model F1 Accuracy</div>
                  <div className="mt-1 font-mono text-base font-bold text-blue-400">{Math.round(kpis.f1 * 100)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="surface p-5 anim-fade-up">
        <div className="section-head">
          <div>
            <div className="hero-kicker">BATCH METRICS</div>
            <h3 className="section-title mt-1">Live Financial Operational Metrics</h3>
          </div>
        </div>
        <KPICards kpis={kpis} />
      </div>

      {/* Main Operating Grid */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {/* Operational Engine Modules */}
          <div className="surface p-5 anim-fade-up">
            <div className="section-head">
              <div>
                <div className="hero-kicker">OPERATIONAL ENGINES</div>
                <h3 className="section-title mt-1">Automated Reconciliation & Audit Services</h3>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {insight.agents.map((agent) => (
                <div key={agent.name} className="agent-card surface-subtle">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{agent.name}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{agent.detail}</div>
                    </div>
                    <span className={`pill ${toneClass(agent.tone)} text-[10px]`}>{agent.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Engine Confidence:</span>
                    <span className="mono font-bold text-slate-200">{agent.confidence}%</span>
                  </div>
                  <div className="mt-1.5 bar-track">
                    <div
                      className={`bar-fill ${
                        agent.tone === "green"
                          ? "bg-emerald-500"
                          : agent.tone === "amber"
                          ? "bg-amber-500"
                          : agent.tone === "red"
                          ? "bg-rose-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${agent.confidence}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Human-in-the-Loop Approval Queue */}
          <div className="surface p-5 anim-fade-up">
            <div className="section-head">
              <div>
                <div className="hero-kicker">APPROVAL QUEUE</div>
                <h3 className="section-title mt-1">Actions Awaiting Auditor Confirmation</h3>
                <p className="section-sub">Discrepancies flagged for human review before ledger settlement posting.</p>
              </div>
              <button onClick={onOpenErrors} className="btn-outline btn-xs">
                View Full Queue ({exceptions.length})
              </button>
            </div>

            <div className="space-y-3">
              {insight.approvalQueue.length > 0 ? (
                insight.approvalQueue.map((item) => (
                  <div key={item.record} className="approval-card surface-subtle">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip mono text-[10px]">{item.record}</span>
                          <span className="pill pill-amber text-[10px]">{item.status}</span>
                          <span className="text-xs text-slate-400">Confidence: {item.confidence}%</span>
                        </div>
                        <div className="text-xs font-semibold text-white">{item.title}</div>
                        <p className="text-xs leading-relaxed text-slate-300">{item.reason}</p>
                        {item.candidate !== "No candidate" && (
                          <div className="text-[11px] text-slate-400">
                            Suggested Match: <span className="mono text-slate-200">{item.candidate}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={onOpenErrors} className="btn-primary btn-xs">
                          Review Evidence
                        </button>
                        <button onClick={onOpenMatches} className="btn-outline btn-xs">
                          Graph
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-[#2b364a] p-4 text-center text-xs text-slate-400">
                  No open approvals pending. All exception items are resolved or cleared.
                </div>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="surface p-5 anim-fade-up">
            <div className="section-head">
              <div>
                <div className="hero-kicker">AUDIT TIMELINE</div>
                <h3 className="section-title mt-1">Reconciliation System Operational Log</h3>
              </div>
            </div>
            <div className="space-y-2">
              {insight.recentEvents.map((event, index) => (
                <div key={`${event.agent}-${index}`} className="flex items-center justify-between gap-3 border-b border-[#1f2736]/60 pb-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="mono text-[10px] font-semibold text-slate-400 bg-[#0e121a] px-2 py-0.5 rounded border border-[#1f2736]">
                      {event.time}
                    </span>
                    <div>
                      <span className="font-semibold text-white">{event.agent}:</span>{" "}
                      <span className="text-slate-300">{event.action}</span>
                    </div>
                  </div>
                  <span className="pill pill-blue text-[10px]">{event.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Risk Radar & Calibration */}
        <div className="space-y-6">
          <div className="surface p-5 anim-fade-up">
            <div className="section-head">
              <div>
                <div className="hero-kicker">RISK ASSESSMENT</div>
                <h3 className="section-title mt-1">Financial Operational Risk Matrix</h3>
              </div>
            </div>
            <div className="space-y-3">
              {insight.radar.map((item) => {
                const severity = severityLabel(item.score);
                return (
                  <div key={item.label} className="risk-card surface-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">{item.label}</span>
                      <span className={`pill ${toneClass(severity.tone)} text-[10px]`}>{severity.label}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="bar-track flex-1">
                        <div
                          className={`bar-fill ${
                            severity.tone === "green"
                              ? "bg-emerald-500"
                              : severity.tone === "amber"
                              ? "bg-amber-500"
                              : severity.tone === "red"
                              ? "bg-rose-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                      <span className="mono text-xs font-bold text-slate-200">{item.score}/100</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">{item.reason}</p>
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
