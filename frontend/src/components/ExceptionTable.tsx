import { useMemo, useState } from "react";
import type { ExceptionRow } from "../types";

type Props = { exceptions: ExceptionRow[]; focusedRecordId: string | null; onFocusRecord: (id: string) => void };

const STATUS: Record<string, string> = {
  MISSING_RECORD: "pill-red",
  DUPLICATE: "pill-amber",
  AMOUNT_MISMATCH: "pill-amber",
  DATE_MISMATCH: "pill-blue",
  NEEDS_HUMAN_REVIEW: "pill-purple",
  LOW_CONFIDENCE: "pill-gray",
};

const REASON: Record<string, string> = {
  missing_counterpart: "Missing",
  amount_mismatch: "Amount",
  duplicate_suspected: "Duplicate",
  date_out_of_tolerance: "Date",
  unresolved_ambiguous: "Ambiguous",
  low_confidence_llm: "Low Confidence",
};

export function ExceptionTable({ exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return exceptions.filter((exception) => {
      const matchesSource = !source || exception.source_type === source;
      const matchesReason = !reason || exception.reason_category === reason;
      const matchesQuery =
        !needle ||
        [exception.source_type, exception.record_id, exception.reason_category, exception.explanation, exception.status]
          .join(" ")
          .toLowerCase()
          .includes(needle);

      return matchesSource && matchesReason && matchesQuery;
    });
  }, [exceptions, query, source, reason]);

  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-white/5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="hero-kicker">Exceptions</div>
            <h3 className="section-title mt-3">Unresolved List</h3>
            <p className="section-sub">
              {rows.length}/{exceptions.length} shown.
            </p>
          </div>
          <span className="pill pill-amber">Review queue</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="field flex-1 min-w-[140px]" />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="sel">
            <option value="">All Sources</option>
            <option value="bank">bank</option>
            <option value="ledger">ledger</option>
            <option value="invoice">invoice</option>
            <option value="bill">bill</option>
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="sel">
            <option value="">All Reasons</option>
            <option value="missing_counterpart">Missing</option>
            <option value="amount_mismatch">Amount</option>
            <option value="duplicate_suspected">Duplicate</option>
            <option value="date_out_of_tolerance">Date</option>
            <option value="unresolved_ambiguous">Ambiguous</option>
            <option value="low_confidence_llm">Low Confidence</option>
          </select>
        </div>
      </div>

      <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
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
            {rows.map((exception, index) => (
              <tr
                key={`${exception.source_type}:${exception.record_id}`}
                className={`${focusedRecordId === exception.record_id ? "bg-amber-500/5" : ""} anim-fade-in`}
                style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
              >
                <td className="font-medium capitalize text-slate-200">{exception.source_type}</td>
                <td>
                  <button className="chip mono text-[10px]" onClick={() => onFocusRecord(exception.record_id)}>
                    {exception.record_id}
                  </button>
                  <div className="mt-0.5 text-[9px] text-slate-500">{REASON[exception.reason_category] ?? exception.reason_category}</div>
                </td>
                <td>
                  <span className={`pill ${STATUS[exception.status] ?? "pill-gray"}`}>{exception.status.replace(/_/g, " ")}</span>
                </td>
                <td className="mono text-[11px] text-slate-300">
                  {exception.best_candidate_id ? (
                    <div>
                      {exception.best_candidate_type}:{exception.best_candidate_id}{" "}
                      <span className="text-slate-500">
                        {exception.best_candidate_confidence != null ? `${Math.round(exception.best_candidate_confidence * 100)}%` : ""}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="max-w-[240px] truncate text-[11px] text-slate-400">{exception.explanation}</td>
                <td className="max-w-[180px] truncate text-[11px] text-slate-400">{exception.suggested_action}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No exceptions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
