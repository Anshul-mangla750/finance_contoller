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
  const [q, setQ] = useState("");
  const [layer, setLayer] = useState<number | "">("");
  const [sort, setSort] = useState<"confidence" | "layer">("confidence");

  const rows = useMemo(() => {
    let r = matches;
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((m) => [m.source_a_id, m.source_b_id, m.pair_type, m.match_kind, m.reasoning].join(" ").toLowerCase().includes(s));
    }
    if (layer !== "") r = r.filter((m) => m.match_layer === layer);
    return [...r].sort((a, b) => sort === "confidence" ? b.confidence - a.confidence : a.match_layer - b.match_layer);
  }, [matches, q, layer, sort]);

  return (
    <div className="solid overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Matches</div>
            <h3 className="text-base font-bold text-gray-900">Matched Records</h3>
            <p className="text-[11px] text-gray-400">{rows.length} of {matches.length}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="field flex-1 min-w-[120px]" />
          <select value={layer} onChange={(e) => setLayer(e.target.value ? Number(e.target.value) : "")} className="sel">
            <option value="">All Layers</option>
            <option value={1}>L1 Exact</option><option value={2}>L2 Fuzzy</option><option value={3}>L3 Composite</option><option value={4}>L4 LLM</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sel">
            <option value="confidence">By Confidence</option><option value="layer">By Layer</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="min-w-full">
          <thead className="tbl-head sticky top-0 z-10">
            <tr>
              <th>Pair</th><th>Source A</th><th>Source B</th><th>Layer</th><th>Confidence</th><th>Reasoning</th>
            </tr>
          </thead>
          <tbody className="tbl-body">
            {rows.map((m, i) => (
              <tr key={`${m.pair_type}:${m.source_a_id}:${m.source_b_id}`}
                className={`${focusedRecordId && (m.source_a_id.includes(focusedRecordId) || m.source_b_id.includes(focusedRecordId)) ? "bg-amber-50" : ""} anim-fade-in`}
                style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}>
                <td className="text-[11px] text-gray-500">{m.pair_type}</td>
                <td><button className="chip mono text-[10px]" onClick={() => onFocusRecord(m.source_a_id)}>{m.source_a_type}:{m.source_a_id}</button></td>
                <td><button className="chip mono text-[10px]" onClick={() => onFocusRecord(m.source_b_id)}>{m.source_b_type}:{m.source_b_id}</button></td>
                <td><span className={`pill ${LAYERS[m.match_layer]?.cls ?? "pill-gray"}`}>{LAYERS[m.match_layer]?.name ?? `L${m.match_layer}`}</span></td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="bar-track flex-1 max-w-[70px]">
                      <div className="bar-fill" style={{ width: `${m.confidence * 100}%`, backgroundColor: m.confidence >= 0.9 ? "#10b981" : m.confidence >= 0.75 ? "#f59e0b" : "#ef4444" }} />
                    </div>
                    <span className="mono text-[11px] font-bold text-gray-700 w-8">{Math.round(m.confidence * 100)}%</span>
                  </div>
                </td>
                <td className="text-[11px] text-gray-500 max-w-[250px] truncate">{m.reasoning}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
