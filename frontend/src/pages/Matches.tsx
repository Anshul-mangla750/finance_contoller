import { useMemo, useState } from "react";
import type { ExceptionRow, MatchRow } from "../types";

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
  if (layer === 1) return { label: "Exact", tone: "pill-green" };
  if (layer === 2) return { label: "Fuzzy", tone: "pill-blue" };
  if (layer === 3) return { label: "Composite", tone: "pill-amber" };
  return { label: "LLM", tone: "pill-purple" };
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

export function MatchesPage({ matches, exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [tab, setTab] = useState<"both" | "matches" | "exceptions">("both");

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

  const summaryCards = [
    {
      label: "Matches",
      value: matches.length.toLocaleString(),
      sub: "Resolved links across sources",
      tone: "pill-green",
    },
    {
      label: "Exceptions",
      value: exceptions.length.toLocaleString(),
      sub: "Items waiting for review",
      tone: exceptions.length > 0 ? "pill-amber" : "pill-green",
    },
    {
      label: "Top Layer",
      value: layerLabel(dominantLayer).label,
      sub: `${matchStats.byLayer[dominantLayer] ?? 0} matches in the leading layer`,
      tone: "pill-blue",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="hero-panel p-6 lg:p-8 anim-fade-up">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative z-10">
            <div className="hero-kicker">Matching Graph</div>
            <h2 className="hero-title mt-4">Evidence-first reconciliation links</h2>
            <p className="hero-sub">
              Review how each match was formed, where the fallback layers were used, and which records still need
              human attention.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { key: "both", label: "All records" },
                { key: "matches", label: `Matches (${matches.length})` },
                { key: "exceptions", label: `Exceptions (${exceptions.length})` },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key as typeof tab)}
                  className={`btn-outline btn-xs ${tab === item.key ? "border-emerald-400/40 text-white" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {summaryCards.map((card) => (
              <div key={card.label} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{card.label}</div>
                    <div className="mt-2 text-2xl font-extrabold text-white">{card.value}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{card.sub}</div>
                  </div>
                  <span className={`pill ${card.tone}`}>{card.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="surface p-5 anim-fade-up">
          <div className="hero-kicker">Match Layers</div>
          <h3 className="section-title mt-3">How records were linked</h3>
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4].map((layer) => {
              const count = matchStats.byLayer[layer] ?? 0;
              const pct = matches.length > 0 ? (count / matches.length) * 100 : 0;
              const meta = layerLabel(layer);
              return (
                <div key={layer}>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span>{meta.label}</span>
                    <span className="mono text-slate-200">{count}</span>
                  </div>
                  <div className="mt-2 bar-track">
                    <div
                      className={`bar-fill ${meta.tone === "pill-green" ? "bg-emerald-400" : meta.tone === "pill-blue" ? "bg-sky-400" : meta.tone === "pill-amber" ? "bg-amber-400" : "bg-cyan-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="surface p-5 anim-fade-up">
          <div className="hero-kicker">Pair Types</div>
          <h3 className="section-title mt-3">Source combinations in play</h3>
          <div className="mt-4 space-y-3">
            {Object.entries(matchStats.byPair).length > 0 ? (
              Object.entries(matchStats.byPair)
                .sort((a, b) => b[1] - a[1])
                .map(([pair, count]) => {
                  const pct = matches.length > 0 ? (count / matches.length) * 100 : 0;
                  return (
                    <div key={pair}>
                      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                        <span className="truncate pr-2">{pair}</span>
                        <span className="mono text-slate-200">{count}</span>
                      </div>
                      <div className="mt-2 bar-track">
                        <div className="bar-fill bg-slate-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-4 text-sm text-slate-400">
                No matched pairs yet.
              </div>
            )}
          </div>
        </div>

        <div className="surface p-5 anim-fade-up">
          <div className="hero-kicker">Exception Reasons</div>
          <h3 className="section-title mt-3">Why records are still open</h3>
          <div className="mt-4 space-y-3">
            {Object.entries(exceptionStats.byReason).length > 0 ? (
              Object.entries(exceptionStats.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => {
                  const pct = exceptions.length > 0 ? (count / exceptions.length) * 100 : 0;
                  return (
                    <div key={reason}>
                      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                        <span className="truncate pr-2">{reason.replace(/_/g, " ")}</span>
                        <span className="mono text-slate-200">{count}</span>
                      </div>
                      <div className="mt-2 bar-track">
                        <div className="bar-fill bg-rose-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-4 text-sm text-slate-400">
                No exception reasons to review.
              </div>
            )}
          </div>
        </div>
      </div>

      {(tab === "both" || tab === "matches") && (
        <div className="surface overflow-hidden anim-fade-up">
          <div className="flex flex-col gap-3 border-b border-white/5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="hero-kicker">Matched Records</div>
              <h3 className="section-title mt-3">Deterministic and fallback links</h3>
              <p className="section-sub">Click any record ID to jump into the evidence trail.</p>
            </div>
            <span className="pill pill-slate">{matches.length} matches</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="tbl-head sticky top-0 z-10">
                <tr>
                  <th>Pair</th>
                  <th>Source A</th>
                  <th>Source B</th>
                  <th>Layer</th>
                  <th>Confidence</th>
                  <th>Reasoning</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {matches.map((match, index) => {
                  const meta = layerLabel(match.match_layer);
                  const highlight =
                    focusedRecordId &&
                    (match.source_a_id.includes(focusedRecordId) || match.source_b_id.includes(focusedRecordId));

                  return (
                    <tr
                      key={`${match.pair_type}:${match.source_a_id}:${match.source_b_id}`}
                      className={highlight ? "bg-emerald-500/5" : ""}
                      style={{ animationDelay: `${Math.min(index * 18, 320)}ms` }}
                    >
                      <td className="text-[11px] text-slate-400">{match.pair_type}</td>
                      <td>
                        <button className="chip mono text-[10px]" onClick={() => onFocusRecord(match.source_a_id)}>
                          {match.source_a_type}:{match.source_a_id}
                        </button>
                      </td>
                      <td>
                        <button className="chip mono text-[10px]" onClick={() => onFocusRecord(match.source_b_id)}>
                          {match.source_b_type}:{match.source_b_id}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="bar-track flex-1 max-w-[96px]">
                            <div
                              className={`bar-fill ${
                                match.confidence >= 0.9 ? "bg-emerald-400" : match.confidence >= 0.75 ? "bg-amber-400" : "bg-rose-400"
                              }`}
                              style={{ width: `${match.confidence * 100}%` }}
                            />
                          </div>
                          <span className="mono text-[11px] font-bold text-slate-300">{percent(match.confidence)}</span>
                        </div>
                      </td>
                      <td className="max-w-[340px] truncate text-[11px] text-slate-400">{match.reasoning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(tab === "both" || tab === "exceptions") && (
        <div className="surface overflow-hidden anim-fade-up" style={{ animationDelay: "0.06s" }}>
          <div className="flex flex-col gap-3 border-b border-white/5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="hero-kicker">Exception Queue</div>
              <h3 className="section-title mt-3">Open records waiting for resolution</h3>
              <p className="section-sub">Each item keeps the human-in-the-loop flow visible.</p>
            </div>
            <span className="pill pill-amber">{exceptions.length} exceptions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="tbl-head sticky top-0 z-10">
                <tr>
                  <th>Source</th>
                  <th>Record</th>
                  <th>Status</th>
                  <th>Best Candidate</th>
                  <th>Explanation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="tbl-body">
                {exceptions.map((exception, index) => {
                  const highlight = focusedRecordId === exception.record_id;

                  return (
                    <tr
                      key={`${exception.source_type}:${exception.record_id}`}
                      className={highlight ? "bg-amber-500/5" : ""}
                      style={{ animationDelay: `${Math.min(index * 18, 320)}ms` }}
                    >
                      <td className="font-medium capitalize text-slate-200">{exception.source_type}</td>
                      <td>
                        <button className="chip mono text-[10px]" onClick={() => onFocusRecord(exception.record_id)}>
                          {exception.record_id}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${statusTone(exception.status)}`}>{exception.status.replace(/_/g, " ")}</span>
                      </td>
                      <td className="mono text-[11px] text-slate-300">
                        {exception.best_candidate_id ? `${exception.best_candidate_type}:${exception.best_candidate_id}` : "-"}
                      </td>
                      <td className="max-w-[260px] truncate text-[11px] text-slate-400">{exception.explanation}</td>
                      <td className="max-w-[220px] truncate text-[11px] text-slate-400">{exception.suggested_action}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
