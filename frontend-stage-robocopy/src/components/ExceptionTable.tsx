import { useMemo, useState } from "react";
import type { ExceptionRow } from "../types";

type Props = {
  exceptions: ExceptionRow[];
  focusedRecordId: string | null;
  onFocusRecord: (recordId: string) => void;
};

export function ExceptionTable({ exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");

  const filtered = useMemo(() => {
    return exceptions.filter((row) => {
      const sourceOk = !sourceFilter || row.source_type === sourceFilter;
      const reasonOk = !reasonFilter || row.reason_category === reasonFilter;
      return sourceOk && reasonOk;
    });
  }, [exceptions, reasonFilter, sourceFilter]);

  return (
    <div className="table-shell">
      <div className="border-b border-sand-200 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="metric-label">Exceptions</p>
            <h3 className="mt-1 text-lg font-semibold text-ink-950">Honest unresolved list</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm outline-none focus:border-moss-400"
            >
              <option value="">All sources</option>
              <option value="bank">bank</option>
              <option value="ledger">ledger</option>
              <option value="invoice">invoice</option>
              <option value="bill">bill</option>
            </select>
            <select
              value={reasonFilter}
              onChange={(event) => setReasonFilter(event.target.value)}
              className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm outline-none focus:border-moss-400"
            >
              <option value="">All reasons</option>
              <option value="missing_counterpart">missing_counterpart</option>
              <option value="amount_mismatch">amount_mismatch</option>
              <option value="date_out_of_tolerance">date_out_of_tolerance</option>
              <option value="duplicate_suspected">duplicate_suspected</option>
              <option value="unresolved_ambiguous">unresolved_ambiguous</option>
              <option value="low_confidence_llm">low_confidence_llm</option>
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-sand-200 text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Record</th>
              <th className="px-4 py-3 font-semibold">Best Candidate</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isFocused = focusedRecordId === row.record_id;
              return (
                <tr key={`${row.source_type}:${row.record_id}`} className={`table-row ${isFocused ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3 font-medium text-ink-700">{row.source_type}</td>
                  <td className="px-4 py-3">
                    <button className="chip mono" onClick={() => onFocusRecord(row.record_id)} type="button">
                      {row.record_id}
                    </button>
                    <div className="mt-1 text-xs text-ink-500">{row.reason_category}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {row.best_candidate_type && row.best_candidate_id ? (
                      <div>
                        <div className="mono text-xs">{row.best_candidate_type}:{row.best_candidate_id}</div>
                        <div className="text-xs text-ink-500">
                          confidence {row.best_candidate_confidence == null ? "n/a" : `${Math.round(row.best_candidate_confidence * 100)}%`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-ink-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{row.explanation}</td>
                  <td className="px-4 py-3 text-ink-600">{row.suggested_action}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                  No exceptions found for that filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

