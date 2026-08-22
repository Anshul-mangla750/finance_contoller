import { useMemo, useState } from "react";
import type { MatchRow } from "../types";

type Props = { matches: MatchRow[]; focusedRecordId: string | null; onFocusRecord: (id: string) => void };

const LAYERS: Record<number, { name: string; cls: string }> = {
  1: { name: "Exact", cls: "pill-green" },
  2: { name: "Fuzzy", cls: "pill-blue" },
  3: { name: "Composite", cls: "pill-amber" },
  4: { name: "LLM", cls: "pill-purple" },
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
      <div className="border-b border-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="hero-kicker">Matches</div>
            <h3 className="section-title mt-3">Matched Records</h3>
            <p className="section-sub">
              {rows.length} of {matches.length} shown.
            </p>
          </div>
          <span className="pill pill-slate">Evidence table</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="field flex-1 min-w-[140px]" />
          <select value={layer} onChange={(e) => setLayer(e.target.value ? Number(e.target.value) : "")} className="sel">
            <option value="">All Layers</option>
            <option value={1}>L1 Exact</option>
            <option value={2}>L2 Fuzzy</option>
            <option value={3}>L3 Composite</option>
            <option value={4}>L4 LLM</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sel">
            <option value="confidence">By Confidence</option>
            <option value="layer">By Layer</option>
          </select>
        </div>
      </div>

      <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
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
            {rows.map((match, index) => {
              const layerMeta = LAYERS[match.match_layer] ?? { name: `L${match.match_layer}`, cls: "pill-gray" };
              const highlight =
                focusedRecordId &&
                (match.source_a_id.includes(focusedRecordId) || match.source_b_id.includes(focusedRecordId));

              return (
                <tr
                  key={`${match.pair_type}:${match.source_a_id}:${match.source_b_id}`}
                  className={`${highlight ? "bg-emerald-500/5" : ""} anim-fade-in`}
                  style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
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
                    <span className={`pill ${layerMeta.cls}`}>{layerMeta.name}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="bar-track flex-1 max-w-[96px]">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${match.confidence * 100}%`,
                            backgroundColor: match.confidence >= 0.9 ? "#10b981" : match.confidence >= 0.75 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="mono w-10 text-[11px] font-bold text-slate-300">{Math.round(match.confidence * 100)}%</span>
                    </div>
                  </td>
                  <td className="max-w-[280px] truncate text-[11px] text-slate-400">{match.reasoning}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
