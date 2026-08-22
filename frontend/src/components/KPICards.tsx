import type { Kpis } from "../types";

type Props = {
  kpis: Kpis;
};

export function KPICards({ kpis }: Props) {
  const items = [
    ["Records", kpis.records_processed.toLocaleString(), "Processed in the batch"],
    ["Match Rate", `${Math.round(kpis.match_rate * 100)}%`, "Overall matched / total"],
    ["Precision", `${Math.round(kpis.precision * 100)}%`, "Correct claims / all claims"],
    ["Recall", `${Math.round(kpis.recall * 100)}%`, "Correct claims / true matches"],
    ["Exceptions", kpis.exception_count.toLocaleString(), "Unresolved or ambiguous records"],
    ["Cash Position", `$${kpis.cash_position.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, "Latest bank balance"],
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value, sub]) => (
        <div key={label} className="metric-card animate-fadeInUp">
          <div className="metric-label">{label}</div>
          <div className="metric-value">{value}</div>
          <div className="metric-sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}

