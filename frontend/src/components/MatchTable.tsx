import { useMemo, useState } from "react";
import type { MatchRow } from "../types";

type Props = {
  matches: MatchRow[];
  focusedRecordId: string | null;
  onFocusRecord: (recordId: string) => void;
};

const LAYER_CONFIG: Record<number, { name: string; badge: string }> = {
  1: { name: "Exact", badge: "badge-green" },
  2: { name: "Fuzzy", badge: "badge-blue" },
  3: { name: "Composite", badge: "badge-amber" },
  4: { name: "LLM", badge: "badge-purple" },
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? "#10b981" : pct >= 75 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar flex-1 max-w-[80px]">
        <div className="progress-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="mono text-xs font-semibold text-[#334155] w-10 text-right">{pct}%</span>
    </div>
  );
}

export function MatchTable({ matches, focusedRecordId, onFocusRecord }: Props) {
  const [search, setSearch] = useState("");
  const [layerFilter, setLayerFilter] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<"confidence" | "layer" | "pair_type">("confidence");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = matches;
    if (query) {
      result = result.filter((m) =>
        [m.source_a_id, m.source_b_id, m.pair_type, m.match_kind, m.reasoning]
          .join(" ").toLowerCase().includes(query)
      );
    }
    if (layerFilter !== "") {
      result = result.filter((m) => m.match_layer === layerFilter);
    }
    return [...result].sort((a, b) => {
      if (sortBy === "confidence") return b.confidence - a.confidence;
      if (sortBy === "layer") return a.match_layer - b.match_layer;
      return (a.pair_type ?? "").localeCompare(b.pair_type ?? "");
    });
  }, [matches, search, layerFilter, sortBy]);

  return (
    <div className="table-container">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Matched Records</div>
            <h3 className="mt-1 text-lg font-bold text-[#0f172a]">Reconciliation Matches</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">{filtered.length} of {matches.length} matches</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="input w-full lg:w-52"
            />
            <select value={layerFilter} onChange={(e) => setLayerFilter(e.target.value ? Number(e.target.value) : "")} className="select w-full lg:w-40">
              <option value="">All Layers</option>
              <option value={1}>Layer 1 — Exact</option>
              <option value={2}>Layer 2 — Fuzzy</option>
              <option value={3}>Layer 3 — Composite</option>
              <option value={4}>Layer 4 — LLM</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="select w-full lg:w-36">
              <option value="confidence">By Confidence</option>
              <option value="layer">By Layer</option>
              <option value="pair_type">By Pair</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Pair</th>
              <th className="table-header-cell">Source A</th>
              <th className="table-header-cell">Source B</th>
              <th className="table-header-cell">Layer</th>
              <th className="table-header-cell">Confidence</th>
              <th className="table-header-cell">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isFocused = focusedRecordId
                ? row.source_a_id.includes(focusedRecordId) || row.source_b_id.includes(focusedRecordId)
                : false;
              const layer = LAYER_CONFIG[row.match_layer] ?? { name: `L${row.match_layer}`, badge: "badge-gray" };
              return (
                <tr
                  key={`${row.pair_type ?? ""}:${row.source_a_id}:${row.source_b_id}`}
                  className={`table-row ${isFocused ? "bg-[#fef3c7]/50" : ""}`}
                >
                  <td className="table-cell">
                    <span className="text-xs font-medium text-[#64748b]">{row.pair_type ?? "—"}</span>
                  </td>
                  <td className="table-cell">
                    <button
                      className="chip mono text-[11px]"
                      onClick={() => onFocusRecord(row.source_a_id)}
                      type="button"
                    >
                      {row.source_a_type}:{row.source_a_id}
                    </button>
                  </td>
                  <td className="table-cell">
                    <button
                      className="chip mono text-[11px]"
                      onClick={() => onFocusRecord(row.source_b_id)}
                      type="button"
                    >
                      {row.source_b_type}:{row.source_b_id}
                    </button>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${layer.badge}`}>{layer.name}</span>
                  </td>
                  <td className="table-cell">
                    <ConfidenceBar confidence={row.confidence} />
                  </td>
                  <td className="table-cell max-w-[300px]">
                    <span className="text-xs text-[#64748b] line-clamp-2">{row.reasoning}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#94a3b8]">
                  No matches found for the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
