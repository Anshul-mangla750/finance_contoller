import { useMemo, useState } from "react";
import type { ExceptionRow } from "../types";

type Props = {
  exceptions: ExceptionRow[];
  focusedRecordId: string | null;
  onFocusRecord: (recordId: string) => void;
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  MISSING_RECORD: { label: "Missing Record", badge: "badge-red" },
  DUPLICATE: { label: "Duplicate", badge: "badge-amber" },
  AMOUNT_MISMATCH: { label: "Amount Mismatch", badge: "badge-amber" },
  DATE_MISMATCH: { label: "Date Mismatch", badge: "badge-blue" },
  NEEDS_HUMAN_REVIEW: { label: "Needs Review", badge: "badge-purple" },
  LOW_CONFIDENCE: { label: "Low Confidence", badge: "badge-gray" },
};

const REASON_LABELS: Record<string, string> = {
  missing_counterpart: "Missing Counterpart",
  amount_mismatch: "Amount Mismatch",
  duplicate_suspected: "Suspected Duplicate",
  date_out_of_tolerance: "Date Out of Range",
  unresolved_ambiguous: "Ambiguous",
  low_confidence_llm: "Low Confidence",
};

export function ExceptionTable({ exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exceptions.filter((row) => {
      const sourceOk = !sourceFilter || row.source_type === sourceFilter;
      const reasonOk = !reasonFilter || row.reason_category === reasonFilter;
      const textOk =
        !query ||
        [row.source_type, row.record_id, row.reason_category, row.explanation, row.suggested_action, row.status]
          .join(" ").toLowerCase().includes(query);
      return sourceOk && reasonOk && textOk;
    });
  }, [exceptions, reasonFilter, sourceFilter, search]);

  return (
    <div className="table-container">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Exception List</div>
            <h3 className="mt-1 text-lg font-bold text-[#0f172a]">Honest Unresolved List</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {filtered.length} of {exceptions.length} exceptions shown — matched + exceptions = total
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="input w-full lg:w-52"
            />
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="select w-full lg:w-32">
              <option value="">All Sources</option>
              <option value="bank">Bank</option>
              <option value="ledger">Ledger</option>
              <option value="invoice">Invoice</option>
              <option value="bill">Bill</option>
            </select>
            <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} className="select w-full lg:w-44">
              <option value="">All Reasons</option>
              <option value="missing_counterpart">Missing Counterpart</option>
              <option value="amount_mismatch">Amount Mismatch</option>
              <option value="date_out_of_tolerance">Date Out of Range</option>
              <option value="duplicate_suspected">Suspected Duplicate</option>
              <option value="unresolved_ambiguous">Ambiguous</option>
              <option value="low_confidence_llm">Low Confidence</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Source</th>
              <th className="table-header-cell">Record</th>
              <th className="table-header-cell">Status</th>
              <th className="table-header-cell">Best Candidate</th>
              <th className="table-header-cell">Explanation</th>
              <th className="table-header-cell">Suggested Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isFocused = focusedRecordId === row.record_id;
              const statusCfg = STATUS_CONFIG[row.status] ?? { label: row.status, badge: "badge-gray" };
              return (
                <tr
                  key={`${row.source_type}:${row.record_id}`}
                  className={`table-row ${isFocused ? "bg-[#fef3c7]/50" : ""}`}
                >
                  <td className="table-cell font-medium text-[#334155] capitalize">{row.source_type}</td>
                  <td className="table-cell">
                    <button className="chip mono text-[11px]" onClick={() => onFocusRecord(row.record_id)} type="button">
                      {row.record_id}
                    </button>
                    <div className="mt-1 text-[10px] text-[#94a3b8]">
                      {REASON_LABELS[row.reason_category] ?? row.reason_category}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${statusCfg.badge}`}>{statusCfg.label}</span>
                  </td>
                  <td className="table-cell">
                    {row.best_candidate_type && row.best_candidate_id ? (
                      <div>
                        <div className="mono text-[11px] text-[#334155]">
                          {row.best_candidate_type}:{row.best_candidate_id}
                        </div>
                        <div className="text-[10px] text-[#94a3b8]">
                          {row.best_candidate_confidence == null ? "n/a" : `${Math.round(row.best_candidate_confidence * 100)}%`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#cbd5e1]">—</span>
                    )}
                  </td>
                  <td className="table-cell max-w-[250px]">
                    <span className="text-xs text-[#64748b] line-clamp-2">{row.explanation}</span>
                  </td>
                  <td className="table-cell max-w-[200px]">
                    <span className="text-xs text-[#64748b] line-clamp-2">{row.suggested_action}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#94a3b8]">
                  No exceptions found for the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
