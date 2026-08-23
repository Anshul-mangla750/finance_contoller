import { useEffect, useMemo, useState } from "react";
import { fetchAuditLogs } from "../api";
import type { AuditLogRow, ExceptionRow, MatchRow } from "../types";

type Props = {
  matches: MatchRow[];
  exceptions: ExceptionRow[];
  focusedRecordId: string | null;
  onFocusRecord: (id: string) => void;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function layerLabel(layer: number) {
  if (layer === 1) return { label: "L1 Exact", tone: "pill-green" };
  if (layer === 2) return { label: "L2 Fuzzy", tone: "pill-blue" };
  if (layer === 3) return { label: "L3 Composite", tone: "pill-amber" };
  return { label: "L4 LLM", tone: "pill-purple" };
}

function statusTone(status: string) {
  const map: Record<string, string> = {
    MISSING_RECORD: "pill-red",
    DUPLICATE: "pill-amber",
    AMOUNT_MISMATCH: "pill-amber",
    DATE_MISMATCH: "pill-blue",
    NEEDS_HUMAN_REVIEW: "pill-purple",
    LOW_CONFIDENCE: "pill-gray",
  };
  return map[status] ?? "pill-gray";
}

type PageToken = number | "ellipsis";

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PageToken[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    tokens.push("ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    tokens.push(page);
  }

  if (end < totalPages - 1) {
    tokens.push("ellipsis");
  }

  tokens.push(totalPages);
  return tokens;
}

export function MatchesPage({ matches, exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [tab, setTab] = useState<"both" | "matches" | "exceptions">("both");
  const [matchPage, setMatchPage] = useState(1);
  const [exceptionPage, setExceptionPage] = useState(1);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const pageSize = 10;

  const matchStats = useMemo(() => {
    const byLayer: Record<number, number> = {};
    const byPair: Record<string, number> = {};

    for (const match of matches) {
      byLayer[match.match_layer] = (byLayer[match.match_layer] ?? 0) + 1;
      byPair[match.pair_type ?? "unknown"] = (byPair[match.pair_type ?? "unknown"] ?? 0) + 1;
    }

    return { byLayer, byPair };
  }, [matches]);

  const exceptionStats = useMemo(() => {
    const byReason: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const exception of exceptions) {
      byReason[exception.reason_category] = (byReason[exception.reason_category] ?? 0) + 1;
      bySource[exception.source_type] = (bySource[exception.source_type] ?? 0) + 1;
    }

    return { byReason, bySource };
  }, [exceptions]);

  const dominantLayer = useMemo(() => {
    const entries = Object.entries(matchStats.byLayer).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? Number(entries[0][0]) : 1;
  }, [matchStats.byLayer]);

  const matchPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(matchPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    return {
      currentPage,
      totalPages,
      start,
      end,
      rows: matches.slice(start, end),
      tokens: buildPageTokens(currentPage, totalPages),
    };
  }, [matchPage, matches, pageSize]);

  useEffect(() => {
    if (matchPage !== matchPagination.currentPage) {
      setMatchPage(matchPagination.currentPage);
    }
  }, [matchPage, matchPagination.currentPage]);

  const exceptionPagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(exceptions.length / pageSize));
    const currentPage = Math.min(exceptionPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    return {
      currentPage,
      totalPages,
      start,
      end,
      rows: exceptions.slice(start, end),
      tokens: buildPageTokens(currentPage, totalPages),
    };
  }, [exceptionPage, exceptions, pageSize]);

  useEffect(() => {
    if (exceptionPage !== exceptionPagination.currentPage) {
      setExceptionPage(exceptionPagination.currentPage);
    }
  }, [exceptionPage, exceptionPagination.currentPage]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const response = await fetchAuditLogs(6);
        if (!cancelled) {
          setAuditLogs(response.items ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setAuditError(error instanceof Error ? error.message : "Failed to load audit trail.");
        }
      } finally {
        if (!cancelled) {
          setAuditLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function auditTone(action: string) {
    const lowered = action.toLowerCase();
    if (lowered.includes("approve") || lowered.includes("resolved")) return "pill-green";
    if (lowered.includes("reject") || lowered.includes("failed")) return "pill-red";
    if (lowered.includes("reconcile") || lowered.includes("match")) return "pill-blue";
    return "pill-amber";
  }

  function formatTimestamp(timestamp: string) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function compactState(value?: string | null) {
    if (!value) return "—";
    return value.replace(/^Status:\s*/i, "").replace(/^Review:\s*/i, "");
  }

  const summaryCards = [
    {
      label: "TOTAL MATCHES",
      value: matches.length.toLocaleString(),
      sub: "Resolved record pairs across ledgers",
      tone: "pill-green",
    },
    {
      label: "EXCEPTIONS",
      value: exceptions.length.toLocaleString(),
      sub: "Discrepancies pending review",
      tone: exceptions.length > 0 ? "pill-amber" : "pill-green",
    },
    {
      label: "PRIMARY LAYER",
      value: layerLabel(dominantLayer).label,
      sub: `${matchStats.byLayer[dominantLayer] ?? 0} pairs linked at primary layer`,
      tone: "pill-blue",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="hero-panel p-6 anim-fade-up">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="hero-kicker">MATCHING GRAPH</div>
            <h2 className="hero-title mt-2">Multi-Layer Ledger Matching & Link Evidence</h2>
            <p className="hero-sub">
              Audit exact matches, fuzzy reference links, composite split-payment pairings, and LLM fallback reasoning behind every ledger pair.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { key: "both", label: "All Ledger Records" },
                { key: "matches", label: `Matched Pairs (${matches.length})` },
                { key: "exceptions", label: `Exceptions (${exceptions.length})` },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key as typeof tab)}
                  className={`btn-outline btn-xs ${tab === item.key ? "bg-[#1c2434] text-white border-blue-500" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {summaryCards.map((card) => (
              <div key={card.label} className="surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</div>
                    <div className="mt-1 mono text-xl font-bold text-white">{card.value}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{card.sub}</div>
                  </div>
                  <span className={`pill ${card.tone} text-[10px]`}>{card.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Layer Statistics Cards */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="surface p-4 anim-fade-up">
          <div className="hero-kicker">LAYER BREAKDOWN</div>
          <h3 className="section-title mt-2">Matching Layer Distribution</h3>
          <div className="mt-3 space-y-2.5">
            {[1, 2, 3, 4].map((layer) => {
              const count = matchStats.byLayer[layer] ?? 0;
              const pct = matches.length > 0 ? (count / matches.length) * 100 : 0;
              const meta = layerLabel(layer);
              return (
                <div key={layer}>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{meta.label}</span>
                    <span className="mono font-bold text-white">{count} ({Math.round(pct)}%)</span>
                  </div>
                  <div className="mt-1 bar-track">
                    <div
                      className={`bar-fill ${
                        meta.tone === "pill-green"
                          ? "bg-emerald-500"
                          : meta.tone === "pill-blue"
                          ? "bg-blue-500"
                          : meta.tone === "pill-amber"
                          ? "bg-amber-500"
                          : "bg-purple-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface p-4 anim-fade-up">
          <div className="hero-kicker">SOURCE PAIRS</div>
          <h3 className="section-title mt-2">Ledger Source Pairings</h3>
          <div className="mt-3 space-y-2.5">
            {Object.entries(matchStats.byPair).length > 0 ? (
              Object.entries(matchStats.byPair)
                .sort((a, b) => b[1] - a[1])
                .map(([pair, count]) => {
                  const pct = matches.length > 0 ? (count / matches.length) * 100 : 0;
                  return (
                    <div key={pair}>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span className="mono">{pair}</span>
                        <span className="mono font-bold text-white">{count}</span>
                      </div>
                      <div className="mt-1 bar-track">
                        <div className="bar-fill bg-slate-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="p-3 text-xs text-slate-400">No paired sources active.</div>
            )}
          </div>
        </div>

        <div className="surface p-4 anim-fade-up">
          <div className="hero-kicker">EXCEPTION TYPES</div>
          <h3 className="section-title mt-2">Unresolved Discrepancies</h3>
          <div className="mt-3 space-y-2.5">
            {Object.entries(exceptionStats.byReason).length > 0 ? (
              Object.entries(exceptionStats.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => {
                  const pct = exceptions.length > 0 ? (count / exceptions.length) * 100 : 0;
                  return (
                    <div key={reason}>
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span className="truncate pr-2">{reason.replace(/_/g, " ")}</span>
                        <span className="mono font-bold text-white">{count}</span>
                      </div>
                      <div className="mt-1 bar-track">
                        <div className="bar-fill bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="p-3 text-xs text-slate-400">No exception categories logged.</div>
            )}
          </div>
        </div>
      </div>

      {/* Matched Records Table with Pagination */}
      {(tab === "both" || tab === "matches") && (
        <div className="surface overflow-hidden anim-fade-up">
          <div className="flex flex-col gap-2 border-b border-[#1f2736] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="hero-kicker">MATCH EVIDENCE TABLE</div>
              <h3 className="section-title mt-1">Verified Reconciliation Links</h3>
            </div>
            <span className="pill pill-green">{matches.length} Total Matches</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="tbl-head">
                <tr>
                  <th>PAIR TYPE</th>
                  <th>SOURCE A RECORD</th>
                  <th>SOURCE B RECORD</th>
                  <th>LAYER</th>
                  <th>CONFIDENCE</th>
                  <th>REASONING EVIDENCE</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {matchPagination.rows.map((match) => {
                  const meta = layerLabel(match.match_layer);
                  const highlight =
                    focusedRecordId &&
                    (match.source_a_id.includes(focusedRecordId) || match.source_b_id.includes(focusedRecordId));

                  return (
                    <tr
                      key={`${match.pair_type}:${match.source_a_id}:${match.source_b_id}`}
                      className={highlight ? "bg-blue-500/10" : ""}
                    >
                      <td className="mono text-[11px] font-medium text-slate-300">{match.pair_type}</td>
                      <td>
                        <button className="chip mono text-[11px]" onClick={() => onFocusRecord(match.source_a_id)}>
                          {match.source_a_type}:{match.source_a_id}
                        </button>
                      </td>
                      <td>
                        <button className="chip mono text-[11px]" onClick={() => onFocusRecord(match.source_b_id)}>
                          {match.source_b_type}:{match.source_b_id}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${meta.tone} text-[10px]`}>{meta.label}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="bar-track flex-1 max-w-[80px]">
                            <div
                              className="bar-fill bg-emerald-500"
                              style={{ width: `${match.confidence * 100}%` }}
                            />
                          </div>
                          <span className="mono w-9 text-right text-xs font-bold text-slate-200">{percent(match.confidence)}</span>
                        </div>
                      </td>
                      <td className="max-w-[340px] truncate text-xs text-slate-300">{match.reasoning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col gap-2 border-t border-[#1f2736] px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div className="text-slate-400">
              Showing{" "}
              <span className="mono font-medium text-white">
                {matches.length === 0 ? 0 : matchPagination.start + 1}-{Math.min(matchPagination.end, matches.length)}
              </span>{" "}
              of <span className="mono font-medium text-white">{matches.length}</span> matches
              <span className="ml-2 text-slate-500">
                (Page {matchPagination.currentPage} of {matchPagination.totalPages})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-outline btn-xs disabled:opacity-40"
                onClick={() => setMatchPage((page) => Math.max(1, page - 1))}
                disabled={matchPagination.currentPage <= 1}
              >
                Previous
              </button>
              {matchPagination.tokens.map((token, index) =>
                token === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-1 text-slate-500">...</span>
                ) : (
                  <button
                    key={token}
                    className={`btn-outline btn-xs min-w-7 ${token === matchPagination.currentPage ? "bg-[#1c2434] text-white border-blue-500 font-bold" : ""}`}
                    onClick={() => setMatchPage(token)}
                  >
                    {token}
                  </button>
                ),
              )}
              <button
                className="btn-outline btn-xs disabled:opacity-40"
                onClick={() => setMatchPage((page) => Math.min(matchPagination.totalPages, page + 1))}
                disabled={matchPagination.currentPage >= matchPagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exception Queue Table */}
      {(tab === "both" || tab === "exceptions") && (
        <div className="surface overflow-hidden anim-fade-up">
          <div className="flex flex-col gap-2 border-b border-[#1f2736] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="hero-kicker">EXCEPTION QUEUE</div>
              <h3 className="section-title mt-1">Open Discrepancies Awaiting Review</h3>
            </div>
            <span className="pill pill-amber">{exceptions.length} Open Exceptions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="tbl-head">
                <tr>
                  <th>SOURCE</th>
                  <th>RECORD ID</th>
                  <th>STATUS</th>
                  <th>BEST CANDIDATE</th>
                  <th>EXPLANATION</th>
                  <th>SUGGESTED ACTION</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {exceptionPagination.rows.map((exception) => {
                  const highlight = focusedRecordId === exception.record_id;

                  return (
                    <tr
                      key={`${exception.source_type}:${exception.record_id}`}
                      className={highlight ? "bg-amber-500/10" : ""}
                    >
                      <td className="font-semibold uppercase text-slate-300">{exception.source_type}</td>
                      <td>
                        <button className="chip mono text-[11px]" onClick={() => onFocusRecord(exception.record_id)}>
                          {exception.record_id}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${statusTone(exception.status)} text-[10px]`}>
                          {exception.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="mono text-xs text-slate-300">
                        {exception.best_candidate_id ? `${exception.best_candidate_type}:${exception.best_candidate_id}` : "-"}
                      </td>
                      <td className="max-w-[260px] truncate text-xs text-slate-300">{exception.explanation}</td>
                      <td className="max-w-[220px] truncate text-xs text-slate-300">{exception.suggested_action}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#1f2736] px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs">
            <div className="text-slate-400">
              Showing{" "}
              <span className="mono font-medium text-white">
                {exceptions.length === 0 ? 0 : exceptionPagination.start + 1}-{Math.min(exceptionPagination.end, exceptions.length)}
              </span>{" "}
              of <span className="mono font-medium text-white">{exceptions.length}</span> exceptions
              <span className="ml-2 text-slate-500">
                (Page {exceptionPagination.currentPage} of {exceptionPagination.totalPages})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-outline btn-xs disabled:opacity-40"
                onClick={() => setExceptionPage((page) => Math.max(1, page - 1))}
                disabled={exceptionPagination.currentPage <= 1}
              >
                Previous
              </button>
              {exceptionPagination.tokens.map((token, index) =>
                token === "ellipsis" ? (
                  <span key={`exception-ellipsis-${index}`} className="px-1 text-slate-500">
                    ...
                  </span>
                ) : (
                  <button
                    key={token}
                    className={`btn-outline btn-xs min-w-7 ${
                      token === exceptionPagination.currentPage ? "bg-[#1c2434] text-white border-blue-500 font-bold" : ""
                    }`}
                    onClick={() => setExceptionPage(token)}
                  >
                    {token}
                  </button>
                ),
              )}
              <button
                className="btn-outline btn-xs disabled:opacity-40"
                onClick={() => setExceptionPage((page) => Math.min(exceptionPagination.totalPages, page + 1))}
                disabled={exceptionPagination.currentPage >= exceptionPagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="surface overflow-hidden anim-fade-up">
        <div className="flex flex-col gap-2 border-b border-[#1f2736] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="hero-kicker">AUDIT TRAIL</div>
            <h3 className="section-title mt-1">Latest Review Events</h3>
          </div>
          <span className="pill pill-slate">{auditLogs.length} Recent Events</span>
        </div>

        {auditError ? (
          <div className="px-4 py-4 text-sm text-red-300">{auditError}</div>
        ) : auditLoading ? (
          <div className="px-4 py-4 text-sm text-slate-400">Loading audit trail...</div>
        ) : auditLogs.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-400">No audit entries are available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="tbl-head">
                <tr>
                  <th>TIME</th>
                  <th>ACTION</th>
                  <th>RECORD</th>
                  <th>REVIEWER</th>
                  <th>BEFORE</th>
                  <th>AFTER</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {auditLogs.map((entry) => (
                  <tr key={`${entry.id ?? entry.timestamp}-${entry.record_id ?? entry.action}`}>
                    <td className="mono text-[11px] text-slate-300">{formatTimestamp(entry.timestamp)}</td>
                    <td>
                      <span className={`pill ${auditTone(entry.action)} text-[10px]`}>{entry.action.replace(/_/g, " ")}</span>
                    </td>
                    <td className="mono text-xs text-slate-300">{entry.record_id ?? entry.run_id ?? "-"}</td>
                    <td className="text-xs text-slate-300">{entry.actor ?? "System"}</td>
                    <td className="max-w-[240px] truncate text-xs text-slate-300">{compactState(entry.previous_state)}</td>
                    <td className="max-w-[240px] truncate text-xs text-slate-300">{compactState(entry.new_state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
