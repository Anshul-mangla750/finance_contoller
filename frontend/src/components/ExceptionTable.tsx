import { useEffect, useMemo, useState } from "react";
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
  missing_counterpart: "Missing Counterpart",
  amount_mismatch: "Amount Mismatch",
  duplicate_suspected: "Duplicate Suspected",
  date_out_of_tolerance: "Date Out of Range",
  unresolved_ambiguous: "Ambiguous Candidates",
  low_confidence_llm: "Low Confidence",
};

const PAGE_SIZE = 15;

type PageToken = number | "ellipsis";

function buildPageTokens(current: number, total: number): PageToken[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const tokens: PageToken[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) tokens.push("ellipsis");
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < total - 1) tokens.push("ellipsis");
  tokens.push(total);
  return tokens;
}

export function ExceptionTable({ exceptions, focusedRecordId, onFocusRecord }: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exceptions.filter((exc) => {
      const matchesSource = !source || exc.source_type === source;
      const matchesReason = !reason || exc.reason_category === reason;
      const matchesQuery =
        !needle ||
        [exc.source_type, exc.record_id, exc.reason_category, exc.explanation, exc.status]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesSource && matchesReason && matchesQuery;
    });
  }, [exceptions, query, source, reason]);

  const pagination = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    return {
      currentPage,
      totalPages,
      start,
      end: start + PAGE_SIZE,
      rows: filtered.slice(start, start + PAGE_SIZE),
      tokens: buildPageTokens(currentPage, totalPages),
    };
  }, [filtered, page]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [query, source, reason]);

  // If clamping occurred, sync state
  useEffect(() => {
    if (page !== pagination.currentPage) setPage(pagination.currentPage);
  }, [page, pagination.currentPage]);

  return (
    <div className="surface overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#1f2736] p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="hero-kicker">EXCEPTION QUEUE</div>
            <h3 className="section-title mt-1">Unresolved Ledger Records</h3>
            <p className="section-sub">
              Showing{" "}
              <span className="mono font-semibold text-white">
                {filtered.length === 0 ? 0 : pagination.start + 1}–{Math.min(pagination.end, filtered.length)}
              </span>{" "}
              of <span className="mono font-semibold text-white">{filtered.length}</span> exception records
              {filtered.length !== exceptions.length && (
                <span className="text-slate-500"> (filtered from {exceptions.length})</span>
              )}
            </p>
          </div>
          <span className="pill pill-amber">{exceptions.length} Open Exceptions</span>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by record ID, status, explanation..."
            className="field flex-1 min-w-[160px]"
          />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="sel w-36">
            <option value="">All Sources</option>
            <option value="bank">bank</option>
            <option value="ledger">ledger</option>
            <option value="invoice">invoice</option>
            <option value="bill">bill</option>
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="sel w-44">
            <option value="">All Reasons</option>
            <option value="missing_counterpart">Missing Counterpart</option>
            <option value="amount_mismatch">Amount Mismatch</option>
            <option value="duplicate_suspected">Duplicate Suspected</option>
            <option value="date_out_of_tolerance">Date Out of Range</option>
            <option value="unresolved_ambiguous">Ambiguous</option>
            <option value="low_confidence_llm">Low Confidence</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="tbl-head">
            <tr>
              <th>SOURCE</th>
              <th>RECORD ID</th>
              <th>STATUS</th>
              <th>BEST CANDIDATE</th>
              <th>EXPLANATION</th>
              <th>ACTION REQUIRED</th>
            </tr>
          </thead>
          <tbody className="tbl-body">
            {pagination.rows.map((exc) => (
              <tr
                key={`${exc.source_type}:${exc.record_id}`}
                className={focusedRecordId === exc.record_id ? "bg-amber-500/10" : ""}
              >
                <td className="font-semibold uppercase text-slate-300">{exc.source_type}</td>
                <td>
                  <button className="chip mono text-[11px]" onClick={() => onFocusRecord(exc.record_id)}>
                    {exc.record_id}
                  </button>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {REASON[exc.reason_category] ?? exc.reason_category}
                  </div>
                </td>
                <td>
                  <span className={`pill ${STATUS[exc.status] ?? "pill-slate"} text-[10px]`}>
                    {exc.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="mono text-xs text-slate-300">
                  {exc.best_candidate_id ? (
                    <span>
                      {exc.best_candidate_type}:{exc.best_candidate_id}{" "}
                      {exc.best_candidate_confidence != null && (
                        <span className="text-slate-400">
                          ({Math.round(exc.best_candidate_confidence * 100)}%)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="max-w-[240px] truncate text-xs text-slate-300">{exc.explanation}</td>
                <td className="max-w-[180px] truncate text-xs text-slate-300">{exc.suggested_action}</td>
              </tr>
            ))}
            {pagination.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                  No exceptions matched the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col gap-2 border-t border-[#1f2736] px-4 py-3 sm:flex-row sm:items-center sm:justify-between text-xs">
        <div className="text-slate-400">
          Page{" "}
          <span className="mono font-semibold text-white">{pagination.currentPage}</span>
          {" "}of{" "}
          <span className="mono font-semibold text-white">{pagination.totalPages}</span>
          <span className="ml-2 text-slate-500">
            — {PAGE_SIZE} rows per page
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            className="btn-outline btn-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            ← Prev
          </button>

          {pagination.tokens.map((token, i) =>
            token === "ellipsis" ? (
              <span key={`el-${i}`} className="px-1 text-slate-500 select-none">…</span>
            ) : (
              <button
                key={token}
                onClick={() => setPage(token)}
                className={`btn-outline btn-xs min-w-7 ${
                  token === pagination.currentPage
                    ? "bg-[#1c2434] text-white border-amber-500/60 font-bold"
                    : ""
                }`}
              >
                {token}
              </button>
            ),
          )}

          <button
            className="btn-outline btn-xs disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={pagination.currentPage >= pagination.totalPages}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
