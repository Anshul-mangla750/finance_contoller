import { useEffect, useMemo, useState } from "react";
import { fetchErrorExplanation, reviewException } from "../api";
import type { ErrorExplanationResponse, ExceptionGroup, ExceptionRow, GroundedExplanation } from "../types";

type Props = { exceptions: ExceptionRow[]; onFocusRecord: (id: string) => void };

const META: Record<string, { label: string; desc: string; icon: string; border: string }> = {
  missing_counterpart: { label: "Missing Counterpart", desc: "No matching record found in another source.", icon: "Search", border: "border-l-rose-500" },
  amount_mismatch: { label: "Amount Mismatch", desc: "Amount differs beyond tolerance.", icon: "Amount", border: "border-l-amber-500" },
  duplicate_suspected: { label: "Suspected Duplicates", desc: "Potential duplicate entries detected.", icon: "Dup", border: "border-l-orange-500" },
  date_out_of_tolerance: { label: "Date Out of Range", desc: "Date gap exceeds the matching window.", icon: "Date", border: "border-l-sky-500" },
  unresolved_ambiguous: { label: "Ambiguous", desc: "Multiple candidates, no confident answer.", icon: "?", border: "border-l-cyan-500" },
  low_confidence_llm: { label: "Low Confidence", desc: "Below the confidence threshold.", icon: "Low", border: "border-l-slate-500" },
};

const ORDER = [
  "missing_counterpart",
  "amount_mismatch",
  "duplicate_suspected",
  "date_out_of_tolerance",
  "unresolved_ambiguous",
  "low_confidence_llm",
];

function group(exceptions: ExceptionRow[]): ExceptionGroup[] {
  const buckets = new Map<string, ExceptionRow[]>();
  for (const exception of exceptions) {
    const rows = buckets.get(exception.reason_category) ?? [];
    rows.push(exception);
    buckets.set(exception.reason_category, rows);
  }

  const groups: ExceptionGroup[] = [];
  const seen = new Set<string>();

  for (const category of ORDER) {
    const items = buckets.get(category);
    if (!items?.length) continue;
    seen.add(category);
    const meta = META[category];
    groups.push({
      category,
      label: meta?.label ?? category,
      description: meta?.desc ?? "",
      items,
    });
  }

  for (const [category, items] of buckets) {
    if (seen.has(category)) continue;
    const meta = META[category];
    groups.push({
      category,
      label: meta?.label ?? category,
      description: meta?.desc ?? "",
      items,
    });
  }

  return groups;
}

function evidenceItems(evidence: Record<string, unknown>) {
  return [
    { label: "Amount Match", value: evidence.amountMatch ? "Yes" : "No", ok: !!evidence.amountMatch },
    { label: "Amount Diff", value: `₹${Number(evidence.amountDifference ?? 0).toFixed(2)}` },
    { label: "Date Gap", value: `${evidence.dateDifference ?? "?"}d` },
    { label: "Ref Match", value: evidence.referenceMatch ? "Yes" : "No", ok: !!evidence.referenceMatch },
    { label: "Description", value: `${Math.round(Number(evidence.descriptionSimilarity ?? 0) * 100)}%` },
    { label: "Fee Adj", value: evidence.feeAdjustmentFound ? "Yes" : "No", ok: !!evidence.feeAdjustmentFound },
    { label: "Tax Adj", value: evidence.taxAdjustmentFound ? "Yes" : "No", ok: !!evidence.taxAdjustmentFound },
    { label: "Counterparty", value: evidence.counterpartyMatch ? "Yes" : "No", ok: !!evidence.counterpartyMatch },
  ];
}

function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const items = evidenceItems(evidence);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-white/5 bg-white/5 p-3">
          <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
          <div className={`mt-1 text-sm font-bold ${item.ok === true ? "text-emerald-300" : item.ok === false ? "text-rose-300" : "text-slate-100"}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function WhySection({ ai }: { ai: GroundedExplanation | null }) {
  if (!ai) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">Why</span>
        <span className={`pill ${ai.certainty === "confirmed_fact" ? "pill-green" : ai.certainty === "likely_explanation" ? "pill-amber" : "pill-gray"}`}>
          {ai.certainty.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] text-slate-400">{Math.round(ai.confidence * 100)}%</span>
      </div>

      {ai.possible_causes.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Possible causes</div>
          <ul className="space-y-2">
            {ai.possible_causes.map((cause, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                <span>{cause}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ai.recommended_action && (
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-300">Recommended Action</div>
          <p className="mt-1 text-sm text-slate-200">{ai.recommended_action}</p>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const [data, setData] = useState<ErrorExplanationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    setData(null);

    fetchErrorExplanation(recordId)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load evidence.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  async function handleReview(action: string) {
    setBusy(true);
    try {
      const response = await reviewException({ record_id: recordId, action });
      setMessage(response.success ? `${action.replace(/_/g, " ").toLowerCase()} recorded` : "Action failed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center text-sm text-slate-400 anim-breathe">
        Loading explanation for {recordId}...
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;
  }

  if (!data) return null;

  const ai = data.ai_explanation;
  const detailEntries = Object.entries(data.record_details).filter(([key]) => !["created_at", "id", "run_id"].includes(key));

  return (
    <div className="surface space-y-4 p-5 anim-expand">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">What</div>
        <p className="mt-1.5 text-sm leading-6 text-slate-200">{ai?.explanation ?? data.status}</p>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">Where</div>
        <p className="mt-1.5 text-xs text-slate-400">
          Record: <span className="mono font-bold text-slate-100">{data.record_id}</span>{" "}
          <span className="text-slate-500">| {data.status}</span>
        </p>
        <div className="mt-3">
          <EvidenceGrid evidence={data.structured_evidence} />
        </div>
        {detailEntries.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/5">
            <table className="min-w-full text-[11px]">
              <thead className="tbl-head">
                <tr>
                  {detailEntries.map(([key]) => (
                    <th key={key}>{key.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tbl-body">
                <tr>
                  {detailEntries.map(([key, value]) => (
                    <td key={key} className="mono max-w-[180px] truncate">
                      {value == null ? "—" : typeof value === "number" ? value.toLocaleString() : String(value)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <WhySection ai={ai} />

      <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
        <button disabled={busy || !!message} onClick={() => void handleReview("APPROVE_MATCH")} className="btn-green btn-xs">
          Approve
        </button>
        <button disabled={busy || !!message} onClick={() => void handleReview("REJECT_MATCH")} className="btn-red btn-xs">
          Reject
        </button>
        <button disabled={busy || !!message} onClick={() => void handleReview("MARK_REVIEWED")} className="btn-outline btn-xs">
          Reviewed
        </button>
        {message && <span className="flex items-center text-xs font-bold text-emerald-300">{message}</span>}
        <button onClick={onClose} className="btn-ghost btn-xs ml-auto">
          Close
        </button>
      </div>
    </div>
  );
}

function ExceptionCard({
  exception,
  expanded,
  onToggle,
  onFocus,
}: {
  exception: ExceptionRow;
  expanded: boolean;
  onToggle: () => void;
  onFocus: (id: string) => void;
}) {
  const meta = META[exception.reason_category] ?? { icon: "Item", border: "border-l-slate-500" };

  return (
    <div className={`rounded-3xl border ${meta.border} border-white/5 bg-white/5 transition-all duration-300 ${expanded ? "shadow-xl" : "hover:border-emerald-400/20"}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mt-0.5 rounded-2xl border border-white/5 bg-slate-950/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="mono text-sm font-bold text-white transition hover:text-emerald-300"
              onClick={(event) => {
                event.stopPropagation();
                onFocus(exception.record_id);
              }}
            >
              {exception.source_type}:{exception.record_id}
            </button>
            <span className={`pill ${statusTone(exception.status)}`}>{exception.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-sm text-slate-400 line-clamp-2">{exception.explanation}</p>
          {exception.best_candidate_id && (
            <p className="mt-1 text-[10px] text-slate-500">
              Best: <span className="mono">{exception.best_candidate_type}:{exception.best_candidate_id}</span>{" "}
              {exception.best_candidate_confidence != null ? `(${Math.round(exception.best_candidate_confidence * 100)}%)` : ""}
            </p>
          )}
          <p className="mt-1 text-[10px] text-slate-500 truncate">Action: {exception.suggested_action}</p>
        </div>
        <svg className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <DetailPanel recordId={exception.record_id} onClose={onToggle} />
        </div>
      )}
    </div>
  );
}

function statusTone(status: string) {
  const map: Record<string, string> = {
    MISSING_RECORD: "pill-red",
    DUPLICATE: "pill-amber",
    AMOUNT_MISMATCH: "pill-amber",
    DATE_MISMATCH: "pill-blue",
    NEEDS_HUMAN_REVIEW: "pill-purple",
    LOW_CONFIDENCE: "pill-gray",
  };
  return map[status] ?? "pill-gray";
}

export function ErrorExplanation({ exceptions, onFocusRecord }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const groups = useMemo(() => group(exceptions), [exceptions]);
  const filteredGroups = useMemo(() => (category ? groups.filter((item) => item.category === category) : groups), [groups, category]);
  const countsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exception of exceptions) {
      counts.set(exception.reason_category, (counts.get(exception.reason_category) ?? 0) + 1);
    }
    return counts;
  }, [exceptions]);

  return (
    <div className="space-y-6">
      <div className="hero-panel p-6 lg:p-8 anim-fade-up">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="hero-kicker">Exception Resolution</div>
            <h2 className="hero-title mt-4">What went wrong, where, and why</h2>
            <p className="hero-sub">
              Each exception is explained with evidence, likely causes, and the next action so the approval flow stays
              visible.
            </p>
          </div>
          <span className="pill pill-red">{exceptions.length} exceptions</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={() => setCategory("")} className={`chip ${!category ? "chip-on" : ""}`}>
            All ({exceptions.length})
          </button>
          {groups.map((groupItem) => (
            <button
              key={groupItem.category}
              onClick={() => setCategory(category === groupItem.category ? "" : groupItem.category)}
              className={`chip ${category === groupItem.category ? "chip-on" : ""}`}
            >
              {META[groupItem.category]?.icon ?? "Item"} {groupItem.label} ({countsByCategory.get(groupItem.category) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {filteredGroups.map((groupItem, index) => (
        <div key={groupItem.category} className="anim-fade-up" style={{ animationDelay: `${index * 70}ms` }}>
          <div className="mb-3">
            <div className="flex items-center gap-3">
              <h3 className="section-title">
                {META[groupItem.category]?.icon ?? "Item"} {groupItem.label}
              </h3>
              <span className="pill pill-slate">{groupItem.items.length} records</span>
            </div>
            {groupItem.description && <p className="section-sub">{groupItem.description}</p>}
          </div>

          <div className="space-y-3">
            {groupItem.items.map((exception) => {
              const key = `${exception.source_type}:${exception.record_id}`;
              return (
                <ExceptionCard
                  key={key}
                  exception={exception}
                  expanded={expandedId === key}
                  onToggle={() => setExpandedId((current) => (current === key ? null : key))}
                  onFocus={onFocusRecord}
                />
              );
            })}
          </div>
        </div>
      ))}

      {filteredGroups.length === 0 && (
        <div className="surface p-12 text-center text-sm text-slate-400">No exceptions in this category.</div>
      )}
    </div>
  );
}
