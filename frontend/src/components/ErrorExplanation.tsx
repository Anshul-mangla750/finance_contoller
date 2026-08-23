import { useEffect, useMemo, useState } from "react";
import { fetchErrorExplanation, reviewException } from "../api";
import type { ErrorExplanationResponse, ExceptionGroup, ExceptionRow, GroundedExplanation } from "../types";

type Props = { exceptions: ExceptionRow[]; onFocusRecord: (id: string) => void };

const META: Record<string, { label: string; desc: string; icon: string }> = {
  missing_counterpart: { label: "Missing Counterpart", desc: "No matching payment or ledger record found in target dataset.", icon: "MISSING" },
  amount_mismatch: { label: "Amount Mismatch", desc: "Monetary amount differs beyond defined tolerance threshold.", icon: "AMOUNT" },
  duplicate_suspected: { label: "Suspected Duplicate", desc: "Multiple identical or overlapping records detected across runs.", icon: "DUPLICATE" },
  date_out_of_tolerance: { label: "Date Gap Out of Tolerance", desc: "Date discrepancy exceeds configured window.", icon: "DATE" },
  unresolved_ambiguous: { label: "Ambiguous Candidate Pair", desc: "Multiple candidate records with similar confidence scores.", icon: "AMBIGUOUS" },
  low_confidence_llm: { label: "Low Confidence Link", desc: "Fallback matching model returned score below threshold.", icon: "LOW CONF" },
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
    { label: "Amount Match", value: evidence.amountMatch ? "PASS" : "FAIL", ok: !!evidence.amountMatch },
    { label: "Amount Difference", value: `$${Number(evidence.amountDifference ?? 0).toFixed(2)}` },
    { label: "Date Gap", value: `${evidence.dateDifference ?? "?"} days` },
    { label: "Ref Code Match", value: evidence.referenceMatch ? "PASS" : "FAIL", ok: !!evidence.referenceMatch },
    { label: "Description Similarity", value: `${Math.round(Number(evidence.descriptionSimilarity ?? 0) * 100)}%` },
    { label: "Fee Adjustment", value: evidence.feeAdjustmentFound ? "DETECTED" : "NONE", ok: !!evidence.feeAdjustmentFound },
    { label: "Tax Adjustment", value: evidence.taxAdjustmentFound ? "DETECTED" : "NONE", ok: !!evidence.taxAdjustmentFound },
    { label: "Counterparty Match", value: evidence.counterpartyMatch ? "MATCHED" : "UNMATCHED", ok: !!evidence.counterpartyMatch },
  ];
}

function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const items = evidenceItems(evidence);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded border border-[#1f2736] bg-[#0e121a] p-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</div>
          <div className={`mt-0.5 font-mono text-xs font-bold ${item.ok === true ? "text-emerald-400" : item.ok === false ? "text-rose-400" : "text-slate-200"}`}>
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
    <div className="space-y-2 border-t border-[#1f2736] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">ANALYSIS DIAGNOSTIC</span>
        <span className={`pill ${ai.certainty === "confirmed_fact" ? "pill-green" : ai.certainty === "likely_explanation" ? "pill-amber" : "pill-slate"} text-[10px]`}>
          {ai.certainty.replace(/_/g, " ").toUpperCase()}
        </span>
        <span className="text-xs text-slate-400">Confidence Score: {Math.round(ai.confidence * 100)}%</span>
      </div>

      {ai.possible_causes.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">IDENTIFIED CAUSES</div>
          <ul className="space-y-1">
            {ai.possible_causes.map((cause, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                <span>{cause}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ai.recommended_action && (
        <div className="rounded border border-blue-500/30 bg-[#172032] p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300">RECOMMENDED REMEDIATION</div>
          <p className="mt-0.5 text-xs text-slate-200">{ai.recommended_action}</p>
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
      setMessage(response.success ? `Recorded: ${action.replace(/_/g, " ")}` : "Action failed");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded border border-[#1f2736] bg-[#0e121a] p-4 text-center text-xs text-slate-400">
        Loading evidence trace for record <span className="mono font-bold text-white">{recordId}</span>...
      </div>
    );
  }

  if (error) {
    return <div className="rounded border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-300">{error}</div>;
  }

  if (!data) return null;

  const ai = data.ai_explanation;
  const detailEntries = Object.entries(data.record_details).filter(([key]) => !["created_at", "id", "run_id"].includes(key));

  return (
    <div className="surface-subtle space-y-3 p-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">SUMMARY EXPLANATION</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-200">{ai?.explanation ?? data.status}</p>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">STRUCTURED AUDIT EVIDENCE</div>
        <div className="mt-2">
          <EvidenceGrid evidence={data.structured_evidence} />
        </div>
        {detailEntries.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded border border-[#1f2736]">
            <table className="min-w-full text-xs">
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
                    <td key={key} className="mono max-w-[160px] truncate">
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

      <div className="flex flex-wrap items-center gap-2 border-t border-[#1f2736] pt-3">
        <button disabled={busy || !!message} onClick={() => void handleReview("APPROVE_MATCH")} className="btn-primary btn-xs">
          Approve Match
        </button>
        <button disabled={busy || !!message} onClick={() => void handleReview("REJECT_MATCH")} className="btn-red btn-xs">
          Reject Match
        </button>
        <button disabled={busy || !!message} onClick={() => void handleReview("MARK_REVIEWED")} className="btn-outline btn-xs">
          Mark Reviewed
        </button>
        {message && <span className="text-xs font-semibold text-emerald-400">{message}</span>}
        <button onClick={onClose} className="btn-ghost btn-xs ml-auto">
          Close Panel
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
  const meta = META[exception.reason_category] ?? { icon: "DISCREPANCY" };

  return (
    <div className={`rounded-lg border border-[#1f2736] bg-[#131822] transition-colors ${expanded ? "border-blue-500/50" : "hover:border-[#2b364a]"}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mono rounded bg-[#171e2b] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 border border-[#232d3f]">
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="mono text-xs font-bold text-white transition hover:text-blue-400 cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onFocus(exception.record_id);
              }}
            >
              {exception.source_type}:{exception.record_id}
            </span>
            <span className={`pill ${statusTone(exception.status)} text-[10px]`}>{exception.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-xs text-slate-300 line-clamp-2">{exception.explanation}</p>
          {exception.best_candidate_id && (
            <div className="mt-1 text-[11px] text-slate-400">
              Suggested Match Candidate: <span className="mono text-slate-200">{exception.best_candidate_type}:{exception.best_candidate_id}</span>{" "}
              {exception.best_candidate_confidence != null ? `(${Math.round(exception.best_candidate_confidence * 100)}%)` : ""}
            </div>
          )}
        </div>
        <svg className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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

const GROUP_PAGE_SIZE = 10;

type PageToken = number | "ellipsis";

function buildTokens(current: number, total: number): PageToken[] {
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

function GroupSection({
  groupItem,
  expandedId,
  onToggle,
  onFocus,
}: {
  groupItem: ExceptionGroup;
  expandedId: string | null;
  onToggle: (key: string) => void;
  onFocus: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(groupItem.items.length / GROUP_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * GROUP_PAGE_SIZE;
  const visibleItems = groupItem.items.slice(start, start + GROUP_PAGE_SIZE);
  const tokens = buildTokens(currentPage, totalPages);

  return (
    <div>
      {/* Group Header */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="section-title">{groupItem.label}</h3>
          <span className="pill pill-slate text-[10px]">{groupItem.items.length} records</span>
        </div>
        {groupItem.items.length > GROUP_PAGE_SIZE && (
          <span className="text-[11px] text-slate-400 mono">
            {start + 1}–{Math.min(start + GROUP_PAGE_SIZE, groupItem.items.length)} of {groupItem.items.length}
          </span>
        )}
      </div>
      {groupItem.description && <p className="section-sub mb-3">{groupItem.description}</p>}

      {/* Cards */}
      <div className="space-y-2">
        {visibleItems.map((exception) => {
          const key = `${exception.source_type}:${exception.record_id}`;
          return (
            <ExceptionCard
              key={key}
              exception={exception}
              expanded={expandedId === key}
              onToggle={() => onToggle(key)}
              onFocus={onFocus}
            />
          );
        })}
      </div>

      {/* Pagination controls (only shown if more than one page) */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-[#1f2736] pt-2">
          <span className="text-[11px] text-slate-400">
            Page <span className="mono font-semibold text-white">{currentPage}</span> of{" "}
            <span className="mono font-semibold text-white">{totalPages}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              className="btn-outline btn-xs disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              ← Prev
            </button>
            {tokens.map((token, i) =>
              token === "ellipsis" ? (
                <span key={`el-${i}`} className="px-1 text-slate-500">…</span>
              ) : (
                <button
                  key={token}
                  onClick={() => setPage(token)}
                  className={`btn-outline btn-xs min-w-7 ${
                    token === currentPage ? "bg-[#1c2434] text-white border-amber-500/60 font-bold" : ""
                  }`}
                >
                  {token}
                </button>
              )
            )}
            <button
              className="btn-outline btn-xs disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorExplanation({ exceptions, onFocusRecord }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const groups = useMemo(() => group(exceptions), [exceptions]);
  const filteredGroups = useMemo(
    () => (category ? groups.filter((item) => item.category === category) : groups),
    [groups, category]
  );
  const countsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exception of exceptions) {
      counts.set(exception.reason_category, (counts.get(exception.reason_category) ?? 0) + 1);
    }
    return counts;
  }, [exceptions]);

  function handleToggle(key: string) {
    setExpandedId((current) => (current === key ? null : key));
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="hero-panel p-5 anim-fade-up">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="hero-kicker">EXCEPTION AUDIT &amp; RESOLUTION</div>
            <h2 className="hero-title mt-1">Discrepancy Investigation &amp; Evidence Review</h2>
            <p className="hero-sub">
              Evidence-backed exception records grouped by failure category. Click any item to inspect the full audit trail.
            </p>
          </div>
          <span className="pill pill-amber shrink-0">{exceptions.length} Open Exceptions</span>
        </div>

        {/* Category Filter Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("")}
            className={`chip ${!category ? "chip-on" : ""}`}
          >
            All ({exceptions.length})
          </button>
          {groups.map((groupItem) => (
            <button
              key={groupItem.category}
              onClick={() => setCategory(category === groupItem.category ? "" : groupItem.category)}
              className={`chip ${category === groupItem.category ? "chip-on" : ""}`}
            >
              {groupItem.label} ({countsByCategory.get(groupItem.category) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Paginated Exception Groups */}
      {filteredGroups.map((groupItem, index) => (
        <div key={groupItem.category} className="anim-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
          <GroupSection
            groupItem={groupItem}
            expandedId={expandedId}
            onToggle={handleToggle}
            onFocus={onFocusRecord}
          />
        </div>
      ))}

      {filteredGroups.length === 0 && (
        <div className="surface p-8 text-center text-xs text-slate-400">
          No open exceptions found in selected category.
        </div>
      )}
    </div>
  );
}

