import { useMemo, useState } from "react";
import type { MatchRow } from "../types";

type Props = { matches: MatchRow[]; focusedRecordId: string | null; onFocusRecord: (id: string) => void };

const LAYERS: Record<number, { name: string; cls: string }> = {
  1: { name: "L1 Exact", cls: "pill-green" },
  2: { name: "L2 Fuzzy", cls: "pill-blue" },
  3: { name: "L3 Composite", cls: "pill-amber" },
  4: { name: "L4 LLM", cls: "pill-purple" },
};

export function MatchTable({ matches, focusedRecordId, onFocusRecord }: Props) {
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<number | "">("");
  const [sort, setSort] = useState<"confidence" | "layer">("confidence");

  const rows = useMemo(() => {
    let filtered = matches;

    if (query.trim()) {
      const needle = query.toLowerCase();
      filtered = filtered.filter((match) =>
        [match.source_a_id, match.source_b_id, match.pair_type, match.match_kind, match.reasoning].join(" ").toLowerCase().includes(needle),
      );
    }

    if (layer !== "") {
      filtered = filtered.filter((match) => match.match_layer === layer);
    }

    return [...filtered].sort((a, b) => (sort === "confidence" ? b.confidence - a.confidence : a.match_layer - b.match_layer));
  }, [matches, query, layer, sort]);

  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-[#1f2736] p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="hero-kicker">MATCHING GRAPH</div>
            <h3 className="section-title mt-1">Reconciliation Linked Record Graph</h3>
            <p className="section-sub">
              Showing {rows.length} of {matches.length} verified match pairs across ledger sources.
            </p>
          </div>
          <span className="pill pill-slate">EVIDENCE AUDIT</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by record ID, pair, or terms..." className="field flex-1 min-w-[180px]" />
          <select value={layer} onChange={(e) => setLayer(e.target.value ? Number(e.target.value) : "")} className="sel w-36">
            <option value="">All Layers</option>
            <option value={1}>L1 Exact</option>
            <option value={2}>L2 Fuzzy</option>
            <option value={3}>L3 Composite</option>
            <option value={4}>L4 LLM</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sel w-40">
            <option value="confidence">Sort by Confidence</option>
            <option value="layer">Sort by Layer</option>
          </select>
        </div>
      </div>

      <div className="max-h-[560px] overflow-x-auto overflow-y-auto">
        <table className="min-w-full">
          <thead className="tbl-head sticky top-0 z-10">
            <tr>
              <th>PAIR TYPE</th>
              <th>SOURCE A RECORD</th>
              <th>SOURCE B RECORD</th>
              <th>LAYER</th>
              <th>CONFIDENCE</th>
              <th>REASONING & EVIDENCE</th>
            </tr>
          </thead>
          <tbody className="tbl-body">
            {rows.map((match, index) => {
              const layerMeta = LAYERS[match.match_layer] ?? { name: `L${match.match_layer}`, cls: "pill-slate" };
              const highlight =
                focusedRecordId &&
                (match.source_a_id.includes(focusedRecordId) || match.source_b_id.includes(focusedRecordId));

              return (
                <tr
                  key={`${match.pair_type}:${match.source_a_id}:${match.source_b_id}`}
                  className={`${highlight ? "bg-blue-500/10" : ""}`}
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
                    <span className={`pill ${layerMeta.cls} text-[10px]`}>{layerMeta.name}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="bar-track flex-1 max-w-[80px]">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${match.confidence * 100}%`,
                            backgroundColor: match.confidence >= 0.9 ? "#10b981" : match.confidence >= 0.75 ? "#3b82f6" : "#f59e0b",
                          }}
                        />
                      </div>
                      <span className="mono w-9 text-right text-xs font-bold text-slate-200">{Math.round(match.confidence * 100)}%</span>
                    </div>
                  </td>
                  <td className="max-w-[320px] truncate text-xs text-slate-300">{match.reasoning}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                  No matching record pairs found matching current criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
