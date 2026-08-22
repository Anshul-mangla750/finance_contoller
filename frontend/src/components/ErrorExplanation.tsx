import { useEffect, useMemo, useState } from "react";
import { fetchErrorExplanation, reviewException } from "../api";
import type { ErrorExplanationResponse, ExceptionGroup, ExceptionRow, GroundedExplanation } from "../types";

type Props = { exceptions: ExceptionRow[]; onFocusRecord: (recordId: string) => void };

const CAT_META: Record<string, { label: string; desc: string; icon: string; color: string }> = {
  missing_counterpart: { label: "Missing Counterpart", desc: "No matching record found in other sources.", icon: "🔍", color: "border-l-[#ef4444]" },
  amount_mismatch: { label: "Amount Mismatch", desc: "Amount differs beyond tolerance.", icon: "⚖️", color: "border-l-[#f59e0b]" },
  duplicate_suspected: { label: "Suspected Duplicates", desc: "Appears to be duplicate entries.", icon: "📋", color: "border-l-[#f97316]" },
  date_out_of_tolerance: { label: "Date Out of Range", desc: "Date gap exceeds reconciliation window.", icon: "📅", color: "border-l-[#3b82f6]" },
  unresolved_ambiguous: { label: "Ambiguous", desc: "Multiple plausible candidates, no confident answer.", icon: "❓", color: "border-l-[#8b5cf6]" },
  low_confidence_llm: { label: "Low Confidence", desc: "Below the confidence threshold.", icon: "⚠️", color: "border-l-[#64748b]" },
};

const CAT_ORDER = ["missing_counterpart", "amount_mismatch", "duplicate_suspected", "date_out_of_tolerance", "unresolved_ambiguous", "low_confidence_llm"];

function groupBy(exceptions: ExceptionRow[]): ExceptionGroup[] {
  const map = new Map<string, ExceptionRow[]>();
  for (const e of exceptions) {
    const arr = map.get(e.reason_category) ?? [];
    arr.push(e);
    map.set(e.reason_category, arr);
  }
  const groups: ExceptionGroup[] = [];
  const seen = new Set<string>();
  for (const cat of CAT_ORDER) {
    const items = map.get(cat);
    if (!items?.length) continue;
    seen.add(cat);
    const m = CAT_META[cat] ?? { label: cat, desc: "", icon: "•", color: "border-l-[#64748b]" };
    groups.push({ category: cat, label: m.label, description: m.desc, items });
  }
  for (const [cat, items] of map) {
    if (seen.has(cat)) continue;
    const m = CAT_META[cat] ?? { label: cat, desc: "", icon: "•", color: "border-l-[#64748b]" };
    groups.push({ category: cat, label: m.label, description: m.desc, items });
  }
  return groups;
}

/* ── Evidence Grid ── */
function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const fields = [
    { label: "Amount Match", value: evidence.amountMatch ? "✓ Yes" : "✗ No", ok: !!evidence.amountMatch },
    { label: "Amount Diff", value: `₹${Number(evidence.amountDifference ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: "Date Gap", value: `${evidence.dateDifference ?? "N/A"}d` },
    { label: "Ref Match", value: evidence.referenceMatch ? "✓ Yes" : "✗ No", ok: !!evidence.referenceMatch },
    { label: "Desc Similarity", value: `${Math.round(Number(evidence.descriptionSimilarity ?? 0) * 100)}%` },
    { label: "Fee Adj Found", value: evidence.feeAdjustmentFound ? "✓" : "✗" },
    { label: "Tax Adj Found", value: evidence.taxAdjustmentFound ? "✓" : "✗" },
    { label: "Counterparty", value: evidence.counterpartyMatch ? "✓ Yes" : "✗ No", ok: !!evidence.counterpartyMatch },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {fields.map(({ label, value, ok }) => (
        <div key={label} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8]">{label}</div>
          <div className={`mt-1 text-sm font-bold ${ok === true ? "text-[#10b981]" : ok === false ? "text-[#ef4444]" : "text-[#0f172a]"}`}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── AI Explanation ── */
function AISection({ ai }: { ai: GroundedExplanation | null }) {
  if (!ai) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#10b981]">3. Kyu — Why</span>
        <span className={`badge ${ai.certainty === "confirmed_fact" ? "badge-green" : ai.certainty === "likely_explanation" ? "badge-amber" : "badge-gray"}`}>
          {ai.certainty.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] text-[#94a3b8]">{Math.round(ai.confidence * 100)}%</span>
      </div>
      {ai.possible_causes.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-[#475569] mb-1">Possible causes:</div>
          <ul className="space-y-1">
            {ai.possible_causes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#334155]">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#94a3b8] shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ai.recommended_action && (
        <div className="rounded-xl bg-[#10b981]/5 border border-[#10b981]/20 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#10b981] mb-1">Recommended Action</div>
          <p className="text-sm text-[#334155]">{ai.recommended_action}</p>
        </div>
      )}
    </div>
  );
}

/* ── Detail Panel ── */
function DetailPanel({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ErrorExplanationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setReviewMsg(null);
    fetchErrorExplanation(recordId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  async function handleReview(action: string) {
    setReviewing(true);
    try {
      const r = await reviewException({ record_id: recordId, action });
      setReviewMsg(r.success ? `✓ ${action.replace(/_/g, " ")}` : "Failed");
    } catch { setReviewMsg("Failed"); }
    finally { setReviewing(false); }
  }

  if (loading) return <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-6 text-center text-sm text-[#94a3b8]">Loading explanation...</div>;
  if (error) return <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-6 text-sm text-[#dc2626]">{error}</div>;
  if (!detail) return null;

  const ai = detail.ai_explanation;
  const ev = detail.structured_evidence;

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 space-y-4">
      {/* What */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#10b981]">1. Kya — What</div>
        <p className="mt-2 text-sm leading-6 text-[#334155]">{ai?.explanation ?? detail.status}</p>
      </div>
      {/* Where */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#10b981]">2. Kaha — Where</div>
        <p className="mt-2 text-xs text-[#64748b]">
          Record: <span className="mono font-bold text-[#0f172a]">{detail.record_id}</span>
          <span className="ml-2 text-[#94a3b8]">| {detail.status}</span>
        </p>
        <div className="mt-3"><EvidenceGrid evidence={ev} /></div>
        {detail.record_details && Object.keys(detail.record_details).length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="min-w-full text-xs">
              <thead><tr className="table-header">
                {Object.keys(detail.record_details).filter((k) => !["created_at", "id", "run_id"].includes(k)).map((k) => (
                  <th key={k} className="table-header-cell">{k.replace(/_/g, " ")}</th>
                ))}
              </tr></thead>
              <tbody><tr>
                {Object.entries(detail.record_details).filter(([k]) => !["created_at", "id", "run_id"].includes(k)).map(([k, v]) => (
                  <td key={k} className="table-cell mono text-[11px] max-w-[180px] truncate">
                    {v == null ? "—" : typeof v === "number" ? v.toLocaleString() : String(v)}
                  </td>
                ))}
              </tr></tbody>
            </table>
          </div>
        )}
      </div>
      {/* Why */}
      <AISection ai={ai} />
      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-[#e2e8f0]">
        <button disabled={reviewing || !!reviewMsg} onClick={() => void handleReview("APPROVE_MATCH")} className="btn-accent btn-sm">✓ Approve</button>
        <button disabled={reviewing || !!reviewMsg} onClick={() => void handleReview("REJECT_MATCH")} className="btn-danger btn-sm">✗ Reject</button>
        <button disabled={reviewing || !!reviewMsg} onClick={() => void handleReview("MARK_REVIEWED")} className="btn-outline btn-sm">Mark Reviewed</button>
        {reviewMsg && <span className="flex items-center text-xs font-semibold text-[#10b981]">{reviewMsg}</span>}
        <button onClick={onClose} className="btn-ghost btn-sm ml-auto">Close</button>
      </div>
    </div>
  );
}

/* ── Card ── */
function ExceptionCard({ exc, expanded, onToggle, onFocus }: { exc: ExceptionRow; expanded: boolean; onToggle: () => void; onFocus: (id: string) => void }) {
  const meta = CAT_META[exc.reason_category] ?? { icon: "•", color: "border-l-[#64748b]" };
  const statusBadge: Record<string, string> = {
    MISSING_RECORD: "badge-red", DUPLICATE: "badge-amber", AMOUNT_MISMATCH: "badge-amber",
    DATE_MISMATCH: "badge-blue", NEEDS_HUMAN_REVIEW: "badge-purple", LOW_CONFIDENCE: "badge-gray",
  };
  return (
    <div className={`rounded-xl border-l-4 ${meta.color} border border-[#e2e8f0] bg-white transition-all duration-200 ${expanded ? "shadow-md" : "hover:shadow-sm"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="text-base mt-0.5">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="mono text-sm font-bold text-[#0f172a] hover:text-[#10b981] transition" onClick={(e) => { e.stopPropagation(); onFocus(exc.record_id); }}>
              {exc.source_type}:{exc.record_id}
            </button>
            <span className={`badge ${statusBadge[exc.status] ?? "badge-gray"}`}>{(exc.status ?? "?").replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-sm text-[#64748b] line-clamp-2">{exc.explanation}</p>
          {exc.best_candidate_id && (
            <p className="mt-1 text-[11px] text-[#94a3b8]">
              Best: <span className="mono">{exc.best_candidate_type}:{exc.best_candidate_id}</span>
              {exc.best_candidate_confidence != null && <span className="ml-1">({Math.round(exc.best_candidate_confidence * 100)}%)</span>}
            </p>
          )}
          <p className="mt-1 text-[11px] text-[#94a3b8] line-clamp-1">→ {exc.suggested_action}</p>
        </div>
        <svg className={`w-4 h-4 text-[#94a3b8] shrink-0 mt-1 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && <div className="px-4 pb-4"><DetailPanel recordId={exc.record_id} onClose={onToggle} /></div>}
    </div>
  );
}

/* ── Main ── */
export function ErrorExplanation({ exceptions, onFocusRecord }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("");
  const groups = useMemo(() => groupBy(exceptions), [exceptions]);
  const filtered = useMemo(() => catFilter ? groups.filter((g) => g.category === catFilter) : groups, [groups, catFilter]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exceptions) m.set(e.reason_category, (m.get(e.reason_category) ?? 0) + 1);
    return m;
  }, [exceptions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Error Analysis</div>
            <h2 className="mt-1 text-2xl font-bold text-[#0f172a]">What went wrong, where, and why</h2>
            <p className="mt-1 text-sm text-[#64748b] max-w-2xl">
              Every exception is explained in plain language: <strong>What</strong> the mismatch is, <strong>Where</strong> it appears,
              and <strong>Why</strong> it likely happened. Expand any card for a detailed breakdown.
            </p>
          </div>
          <div className="badge badge-red text-sm px-3 py-1.5 whitespace-nowrap">
            {exceptions.length} exceptions · {groups.length} categories
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setCatFilter("")} className={`chip ${!catFilter ? "chip-active" : ""}`}>
            All ({exceptions.length})
          </button>
          {groups.map((g) => (
            <button key={g.category} type="button" onClick={() => setCatFilter(catFilter === g.category ? "" : g.category)}
              className={`chip ${catFilter === g.category ? "chip-active" : ""}`}>
              {CAT_META[g.category]?.icon} {g.label} ({byCat.get(g.category) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      {filtered.map((g) => (
        <div key={g.category} className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-[#0f172a]">{CAT_META[g.category]?.icon} {g.label}</h3>
            <span className="badge badge-gray">{g.items.length} record{g.items.length !== 1 ? "s" : ""}</span>
          </div>
          {g.description && <p className="text-xs text-[#94a3b8]">{g.description}</p>}
          <div className="space-y-2">
            {g.items.map((exc) => {
              const key = `${exc.source_type}:${exc.record_id}`;
              return (
                <ExceptionCard
                  key={key} exc={exc} expanded={expandedId === key}
                  onToggle={() => setExpandedId((p) => p === key ? null : key)}
                  onFocus={onFocusRecord}
                />
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="card p-12 text-center text-[#94a3b8]">No exceptions in this category.</div>}
    </div>
  );
}
