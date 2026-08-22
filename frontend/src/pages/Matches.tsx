import { useMemo, useState } from "react";
import type { ExceptionRow, MatchRow } from "../types";

type Props = { matches: MatchRow[]; exceptions: ExceptionRow[]; focusedRecordId: string | null; onFocusRecord: (id: string) => void };

export function MatchesPage({ matches, exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [tab, setTab] = useState<"both" | "matches" | "exceptions">("both");

  const matchStats = useMemo(() => {
    const layers: Record<number, number> = {};
    const pairs: Record<string, number> = {};
    for (const m of matches) {
      layers[m.match_layer] = (layers[m.match_layer] ?? 0) + 1;
      pairs[m.pair_type ?? "unknown"] = (pairs[m.pair_type ?? "unknown"] ?? 0) + 1;
    }
    return { layers, pairs };
  }, [matches]);

  const excStats = useMemo(() => {
    const byReason: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const e of exceptions) {
      byReason[e.reason_category] = (byReason[e.reason_category] ?? 0) + 1;
      bySource[e.source_type] = (bySource[e.source_type] ?? 0) + 1;
    }
    return { byReason, bySource };
  }, [exceptions]);

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <div className="solid p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 anim-fade-up">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Reconciliation Results</div>
          <h2 className="mt-1 text-lg font-bold text-gray-900">
            <span className="text-emerald-600">{matches.length}</span> matches found · <span className="text-red-500">{exceptions.length}</span> exceptions
          </h2>
        </div>
        <div className="flex gap-2">
          {(["both", "matches", "exceptions"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn-xs ${tab === t ? "btn-dark" : "btn-outline"}`}>
              {t === "both" ? "Both" : t === "matches" ? `Matches (${matches.length})` : `Exceptions (${exceptions.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 anim-fade-up" style={{ animationDelay: "0.05s" }}>
        {/* Match Layers */}
        <div className="solid p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">Match Layers</div>
          <div className="space-y-2">
            {[{ id: 1, name: "Exact", color: "bg-emerald-500" }, { id: 2, name: "Fuzzy", color: "bg-blue-500" }, { id: 3, name: "Composite", color: "bg-amber-500" }, { id: 4, name: "LLM", color: "bg-purple-500" }].map(({ id, name, color }) => {
              const count = matchStats.layers[id] ?? 0;
              const pct = matches.length ? (count / matches.length) * 100 : 0;
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-20">{name}</span>
                  <div className="flex-1 bar-track"><div className={`bar-fill ${color}`} style={{ width: `${pct}%` }} /></div>
                  <span className="mono text-xs font-bold text-gray-900 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Match Pairs */}
        <div className="solid p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">By Pair Type</div>
          <div className="space-y-2">
            {Object.entries(matchStats.pairs).map(([pair, count]) => {
              const pct = matches.length ? (count / matches.length) * 100 : 0;
              return (
                <div key={pair} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28 truncate">{pair}</span>
                  <div className="flex-1 bar-track"><div className="bar-fill bg-gray-800" style={{ width: `${pct}%` }} /></div>
                  <span className="mono text-xs font-bold text-gray-900 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Exception Breakdown */}
        <div className="solid p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">Exception Reasons</div>
          <div className="space-y-2">
            {Object.entries(excStats.byReason).sort((a, b) => b[1] - a[1]).map(([reason, count]) => {
              const pct = exceptions.length ? (count / exceptions.length) * 100 : 0;
              return (
                <div key={reason} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28 truncate">{reason.replace(/_/g, " ")}</span>
                  <div className="flex-1 bar-track"><div className="bar-fill bg-red-500" style={{ width: `${pct}%` }} /></div>
                  <span className="mono text-xs font-bold text-gray-900 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tables */}
      {(tab === "both" || tab === "matches") && (
        <div className="anim-slide-right">
          <div className="pg-head">
            <h3 className="pg-title text-lg">Matched Records</h3>
            <p className="pg-sub">Click any record ID to cross-reference</p>
          </div>
          <div className="solid overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-wrap gap-2">
              <div className="text-[11px] text-gray-500">{matches.length} matches</div>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="min-w-full">
                <thead className="tbl-head sticky top-0 z-10">
                  <tr><th>Pair</th><th>Source A</th><th>Source B</th><th>Layer</th><th>Confidence</th><th>Reasoning</th></tr>
                </thead>
                <tbody className="tbl-body">
                  {matches.map((m, i) => {
                    const layers: Record<number, { n: string; c: string }> = { 1: { n: "Exact", c: "pill-green" }, 2: { n: "Fuzzy", c: "pill-blue" }, 3: { n: "Composite", c: "pill-amber" }, 4: { n: "LLM", c: "pill-purple" } };
                    const l = layers[m.match_layer] ?? { n: `L${m.match_layer}`, c: "pill-gray" };
                    return (
                      <tr key={`${m.pair_type}:${m.source_a_id}:${m.source_b_id}`}
                        className={`${focusedRecordId && (m.source_a_id.includes(focusedRecordId) || m.source_b_id.includes(focusedRecordId)) ? "bg-amber-50" : ""}`}
                        style={{ animationDelay: `${Math.min(i * 15, 300)}ms` }}>
                        <td className="text-[11px] text-gray-500">{m.pair_type}</td>
                        <td><button className="chip mono text-[10px]" onClick={() => onFocusRecord(m.source_a_id)}>{m.source_a_type}:{m.source_a_id}</button></td>
                        <td><button className="chip mono text-[10px]" onClick={() => onFocusRecord(m.source_b_id)}>{m.source_b_type}:{m.source_b_id}</button></td>
                        <td><span className={`pill ${l.c}`}>{l.n}</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="bar-track flex-1 max-w-[70px]"><div className="bar-fill" style={{ width: `${m.confidence * 100}%`, backgroundColor: m.confidence >= 0.9 ? "#10b981" : m.confidence >= 0.75 ? "#f59e0b" : "#ef4444" }} /></div>
                            <span className="mono text-[11px] font-bold text-gray-700 w-8">{Math.round(m.confidence * 100)}%</span>
                          </div>
                        </td>
                        <td className="text-[11px] text-gray-500 max-w-[250px] truncate">{m.reasoning}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(tab === "both" || tab === "exceptions") && (
        <div className="anim-slide-right" style={{ animationDelay: "0.1s" }}>
          <div className="pg-head">
            <h3 className="pg-title text-lg">Exception List</h3>
            <p className="pg-sub">matched + exceptions = total (per source)</p>
          </div>
          <div className="solid overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="min-w-full">
                <thead className="tbl-head sticky top-0 z-10">
                  <tr><th>Source</th><th>Record</th><th>Status</th><th>Best Candidate</th><th>Explanation</th><th>Action</th></tr>
                </thead>
                <tbody className="tbl-body">
                  {exceptions.map((e, i) => {
                    const sc: Record<string, string> = { MISSING_RECORD: "pill-red", DUPLICATE: "pill-amber", AMOUNT_MISMATCH: "pill-amber", DATE_MISMATCH: "pill-blue", NEEDS_HUMAN_REVIEW: "pill-purple", LOW_CONFIDENCE: "pill-gray" };
                    return (
                      <tr key={`${e.source_type}:${e.record_id}`} className={`${focusedRecordId === e.record_id ? "bg-amber-50" : ""}`}>
                        <td className="font-medium capitalize">{e.source_type}</td>
                        <td><button className="chip mono text-[10px]" onClick={() => onFocusRecord(e.record_id)}>{e.record_id}</button></td>
                        <td><span className={`pill ${sc[e.status] ?? "pill-gray"}`}>{(e.status ?? "?").replace(/_/g, " ")}</span></td>
                        <td className="mono text-[11px]">{e.best_candidate_id ? `${e.best_candidate_type}:${e.best_candidate_id}` : <span className="text-gray-300">—</span>}</td>
                        <td className="text-[11px] text-gray-500 max-w-[220px] truncate">{e.explanation}</td>
                        <td className="text-[11px] text-gray-500 max-w-[180px] truncate">{e.suggested_action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
