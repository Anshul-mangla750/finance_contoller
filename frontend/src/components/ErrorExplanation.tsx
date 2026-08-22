import { useEffect, useMemo, useState } from "react";
import { fetchErrorExplanation, reviewException } from "../api";
import type { ErrorExplanationResponse, ExceptionGroup, ExceptionRow, GroundedExplanation } from "../types";

type Props = { exceptions: ExceptionRow[]; onFocusRecord: (id: string) => void };

const META: Record<string, { label: string; desc: string; icon: string; border: string }> = {
  missing_counterpart: { label: "Missing Counterpart", desc: "No matching record found in other sources.", icon: "🔍", border: "border-l-red-500" },
  amount_mismatch: { label: "Amount Mismatch", desc: "Amount differs beyond tolerance.", icon: "⚖️", border: "border-l-amber-500" },
  duplicate_suspected: { label: "Suspected Duplicates", desc: "Appears to be duplicate entries.", icon: "📋", border: "border-l-orange-500" },
  date_out_of_tolerance: { label: "Date Out of Range", desc: "Date gap exceeds reconciliation window.", icon: "📅", border: "border-l-blue-500" },
  unresolved_ambiguous: { label: "Ambiguous", desc: "Multiple candidates, no confident answer.", icon: "❓", border: "border-l-purple-500" },
  low_confidence_llm: { label: "Low Confidence", desc: "Below confidence threshold.", icon: "⚠️", border: "border-l-gray-400" },
};
const ORDER = ["missing_counterpart", "amount_mismatch", "duplicate_suspected", "date_out_of_tolerance", "unresolved_ambiguous", "low_confidence_llm"];

function group(exceptions: ExceptionRow[]): ExceptionGroup[] {
  const map = new Map<string, ExceptionRow[]>();
  for (const e of exceptions) { const a = map.get(e.reason_category) ?? []; a.push(e); map.set(e.reason_category, a); }
  const g: ExceptionGroup[] = []; const seen = new Set<string>();
  for (const c of ORDER) { const items = map.get(c); if (!items?.length) continue; seen.add(c); const m = META[c]; g.push({ category: c, label: m?.label ?? c, description: m?.desc ?? "", items }); }
  for (const [c, items] of map) { if (seen.has(c)) continue; const m = META[c]; g.push({ category: c, label: m?.label ?? c, description: m?.desc ?? "", items }); }
  return g;
}

/* Evidence Grid */
function EvidenceGrid({ ev }: { ev: Record<string, unknown> }) {
  const f = [
    { l: "Amount Match", v: ev.amountMatch ? "✓" : "✗", ok: !!ev.amountMatch },
    { l: "Amount Diff", v: `₹${Number(ev.amountDifference ?? 0).toFixed(2)}` },
    { l: "Date Gap", v: `${ev.dateDifference ?? "?"}d` },
    { l: "Ref Match", v: ev.referenceMatch ? "✓" : "✗", ok: !!ev.referenceMatch },
    { l: "Desc Sim", v: `${Math.round(Number(ev.descriptionSimilarity ?? 0) * 100)}%` },
    { l: "Fee Adj", v: ev.feeAdjustmentFound ? "✓" : "✗" },
    { l: "Tax Adj", v: ev.taxAdjustmentFound ? "✓" : "✗" },
    { l: "Counterparty", v: ev.counterpartyMatch ? "✓" : "✗", ok: !!ev.counterpartyMatch },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {f.map(({ l, v, ok }) => (
        <div key={l} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <div className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{l}</div>
          <div className={`mt-0.5 text-sm font-bold ${ok === true ? "text-emerald-600" : ok === false ? "text-red-500" : "text-gray-900"}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* AI Explanation */
function WhySection({ ai }: { ai: GroundedExplanation | null }) {
  if (!ai) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">3. Kyu — Why</span>
        <span className={`pill ${ai.certainty === "confirmed_fact" ? "pill-green" : ai.certainty === "likely_explanation" ? "pill-amber" : "pill-gray"}`}>{ai.certainty.replace(/_/g, " ")}</span>
        <span className="text-[10px] text-gray-400">{Math.round(ai.confidence * 100)}%</span>
      </div>
      {ai.possible_causes.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-gray-500 mb-1">Possible causes:</div>
          <ul className="space-y-1">
            {ai.possible_causes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />{c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ai.recommended_action && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Recommended Action</div>
          <p className="text-sm text-gray-700">{ai.recommended_action}</p>
        </div>
      )}
    </div>
  );
}

/* Detail Panel */
function Detail({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const [d, setD] = useState<ErrorExplanationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true); setD(null); setMsg(null);
    fetchErrorExplanation(recordId).then((r) => { if (!cancel) setD(r); }).catch((e) => { if (!cancel) setErr(e.message); }).finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recordId]);

  async function review(action: string) {
    setBusy(true);
    try { const r = await reviewException({ record_id: recordId, action }); setMsg(r.success ? `✓ ${action.replace(/_/g, " ")}` : "Failed"); }
    catch { setMsg("Failed"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400 anim-breathe">Loading explanation for {recordId}...</div>;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">{err}</div>;
  if (!d) return null;
  const ai = d.ai_explanation;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 anim-expand">
      {/* What */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">1. Kya — What</div>
        <p className="mt-1.5 text-sm leading-6 text-gray-700">{ai?.explanation ?? d.status}</p>
      </div>
      {/* Where */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">2. Kaha — Where</div>
        <p className="mt-1.5 text-xs text-gray-500">Record: <span className="mono font-bold text-gray-900">{d.record_id}</span> <span className="text-gray-400">| {d.status}</span></p>
        <div className="mt-2"><EvidenceGrid ev={d.structured_evidence} /></div>
        {d.record_details && Object.keys(d.record_details).length > 0 && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-[11px]">
              <thead><tr className="tbl-head">{Object.keys(d.record_details).filter((k) => !["created_at", "id", "run_id"].includes(k)).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
              <tbody className="tbl-body"><tr>{Object.entries(d.record_details).filter(([k]) => !["created_at", "id", "run_id"].includes(k)).map(([k, v]) => (
                <td key={k} className="mono max-w-[160px] truncate">{v == null ? "—" : typeof v === "number" ? v.toLocaleString() : String(v)}</td>
              ))}</tr></tbody>
            </table>
          </div>
        )}
      </div>
      {/* Why */}
      <WhySection ai={ai} />
      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
        <button disabled={busy || !!msg} onClick={() => void review("APPROVE_MATCH")} className="btn-green btn-xs">✓ Approve</button>
        <button disabled={busy || !!msg} onClick={() => void review("REJECT_MATCH")} className="btn-red btn-xs">✗ Reject</button>
        <button disabled={busy || !!msg} onClick={() => void review("MARK_REVIEWED")} className="btn-outline btn-xs">Reviewed</button>
        {msg && <span className="flex items-center text-xs font-bold text-emerald-600">{msg}</span>}
        <button onClick={onClose} className="btn-ghost btn-xs ml-auto">Close</button>
      </div>
    </div>
  );
}

/* Exception Card */
function Card({ exc, expanded, onToggle, onFocus }: { exc: ExceptionRow; expanded: boolean; onToggle: () => void; onFocus: (id: string) => void }) {
  const m = META[exc.reason_category] ?? { icon: "•", border: "border-l-gray-400" };
  const sc: Record<string, string> = { MISSING_RECORD: "pill-red", DUPLICATE: "pill-amber", AMOUNT_MISMATCH: "pill-amber", DATE_MISMATCH: "pill-blue", NEEDS_HUMAN_REVIEW: "pill-purple", LOW_CONFIDENCE: "pill-gray" };

  return (
    <div className={`rounded-xl border-l-4 ${m.border} border border-gray-200 bg-white transition-all duration-300 ${expanded ? "shadow-lg ring-1 ring-gray-200" : "hover:shadow-md"}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="text-base mt-0.5 anim-bounce-in">{m.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button className="mono text-sm font-bold text-gray-900 hover:text-emerald-600 transition" onClick={(e) => { e.stopPropagation(); onFocus(exc.record_id); }}>
              {exc.source_type}:{exc.record_id}
            </button>
            <span className={`pill ${sc[exc.status] ?? "pill-gray"}`}>{(exc.status ?? "?").replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{exc.explanation}</p>
          {exc.best_candidate_id && <p className="mt-0.5 text-[10px] text-gray-400">Best: <span className="mono">{exc.best_candidate_type}:{exc.best_candidate_id}</span> {exc.best_candidate_confidence != null ? `(${Math.round(exc.best_candidate_confidence * 100)}%)` : ""}</p>}
          <p className="mt-0.5 text-[10px] text-gray-400 truncate">→ {exc.suggested_action}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {expanded && <div className="px-4 pb-4"><Detail recordId={exc.record_id} onClose={onToggle} /></div>}
    </div>
  );
}

/* Main */
export function ErrorExplanation({ exceptions, onFocusRecord }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("");
  const groups = useMemo(() => group(exceptions), [exceptions]);
  const filtered = useMemo(() => catFilter ? groups.filter((g) => g.category === catFilter) : groups, [groups, catFilter]);
  const byCat = useMemo(() => { const m = new Map<string, number>(); for (const e of exceptions) m.set(e.reason_category, (m.get(e.reason_category) ?? 0) + 1); return m; }, [exceptions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="elevated p-6 bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-l-red-500 anim-fade-up">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">Error Analysis</div>
            <h2 className="mt-1 text-2xl font-extrabold text-gray-900">What went wrong, where, and why</h2>
            <p className="mt-1 text-sm text-gray-600 max-w-2xl">Every exception explained in plain language. Expand any card for a detailed breakdown with evidence comparison and AI root cause analysis.</p>
          </div>
          <div className="pill pill-red text-sm px-4 py-1.5">{exceptions.length} exceptions · {groups.length} categories</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setCatFilter("")} className={`chip ${!catFilter ? "chip-on" : ""}`}>All ({exceptions.length})</button>
          {groups.map((g) => (
            <button key={g.category} onClick={() => setCatFilter(catFilter === g.category ? "" : g.category)} className={`chip ${catFilter === g.category ? "chip-on" : ""}`}>
              {META[g.category]?.icon} {g.label} ({byCat.get(g.category) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      {filtered.map((g, gi) => (
        <div key={g.category} className="anim-fade-up" style={{ animationDelay: `${gi * 80}ms` }}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-base font-bold text-gray-900">{META[g.category]?.icon} {g.label}</h3>
            <span className="pill pill-gray">{g.items.length} record{g.items.length !== 1 ? "s" : ""}</span>
          </div>
          {g.description && <p className="text-xs text-gray-400 mb-3">{g.description}</p>}
          <div className="space-y-2">
            {g.items.map((exc) => {
              const key = `${exc.source_type}:${exc.record_id}`;
              return <Card key={key} exc={exc} expanded={expandedId === key} onToggle={() => setExpandedId((p) => p === key ? null : key)} onFocus={onFocusRecord} />;
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="solid p-12 text-center text-gray-400">No exceptions in this category.</div>}
    </div>
  );
}
