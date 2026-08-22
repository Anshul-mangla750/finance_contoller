import { useMemo, useState } from "react";
import type { ExceptionRow } from "../types";

type Props = { exceptions: ExceptionRow[]; focusedRecordId: string | null; onFocusRecord: (id: string) => void };

const STATUS: Record<string, string> = {
  MISSING_RECORD: "pill-red", DUPLICATE: "pill-amber", AMOUNT_MISMATCH: "pill-amber",
  DATE_MISMATCH: "pill-blue", NEEDS_HUMAN_REVIEW: "pill-purple", LOW_CONFIDENCE: "pill-gray",
};
const REASON: Record<string, string> = {
  missing_counterpart: "Missing", amount_mismatch: "Amount", duplicate_suspected: "Duplicate",
  date_out_of_tolerance: "Date", unresolved_ambiguous: "Ambiguous", low_confidence_llm: "Low Conf",
};

export function ExceptionTable({ exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    return exceptions.filter((e) => {
      const sq = q.toLowerCase();
      return (!src || e.source_type === src) && (!reason || e.reason_category === reason) &&
        (!sq || [e.source_type, e.record_id, e.reason_category, e.explanation, e.status].join(" ").toLowerCase().includes(sq));
    });
  }, [exceptions, q, src, reason]);

  return (
    <div className="solid overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Exceptions</div>
            <h3 className="text-base font-bold text-gray-900">Unresolved List</h3>
            <p className="text-[11px] text-gray-400">{rows.length}/{exceptions.length} shown · matched + exceptions = total</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="field flex-1 min-w-[120px]" />
          <select value={src} onChange={(e) => setSrc(e.target.value)} className="sel"><option value="">All Sources</option><option>bank</option><option>ledger</option><option>invoice</option><option>bill</option></select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="sel"><option value="">All Reasons</option><option value="missing_counterpart">Missing</option><option value="amount_mismatch">Amount</option><option value="duplicate_suspected">Duplicate</option><option value="date_out_of_tolerance">Date</option><option value="unresolved_ambiguous">Ambiguous</option><option value="low_confidence_llm">Low Conf</option></select>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="min-w-full">
          <thead className="tbl-head sticky top-0 z-10">
            <tr><th>Source</th><th>Record</th><th>Status</th><th>Best Candidate</th><th>Explanation</th><th>Action</th></tr>
          </thead>
          <tbody className="tbl-body">
            {rows.map((e, i) => (
              <tr key={`${e.source_type}:${e.record_id}`}
                className={`${focusedRecordId === e.record_id ? "bg-amber-50" : ""} anim-fade-in`}
                style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}>
                <td className="font-medium capitalize">{e.source_type}</td>
                <td>
                  <button className="chip mono text-[10px]" onClick={() => onFocusRecord(e.record_id)}>{e.record_id}</button>
                  <div className="text-[9px] text-gray-400 mt-0.5">{REASON[e.reason_category] ?? e.reason_category}</div>
                </td>
                <td><span className={`pill ${STATUS[e.status] ?? "pill-gray"}`}>{(e.status ?? "?").replace(/_/g, " ")}</span></td>
                <td className="mono text-[11px]">
                  {e.best_candidate_id ? (
                    <div>{e.best_candidate_type}:{e.best_candidate_id} <span className="text-gray-400">{e.best_candidate_confidence != null ? `${Math.round(e.best_candidate_confidence * 100)}%` : ""}</span></div>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="text-[11px] text-gray-500 max-w-[220px] truncate">{e.explanation}</td>
                <td className="text-[11px] text-gray-500 max-w-[180px] truncate">{e.suggested_action}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No exceptions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
