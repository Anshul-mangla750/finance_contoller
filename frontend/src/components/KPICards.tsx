import type { Kpis } from "../types";

type Props = { kpis: Kpis };

function currency(value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}$${formatted}`;
}

export function KPICards({ kpis }: Props) {
  const items = [
    {
      label: "Observed Records",
      value: kpis.records_processed.toLocaleString(),
      sub: "Total processed in current run",
      pill: "pill-slate",
      pillText: "BATCH",
      icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
    },
    {
      label: "Match Rate",
      value: `${Math.round(kpis.match_rate * 100)}%`,
      sub: "Auto-reconciled transactions",
      pill: "pill-green",
      pillText: "RECONCILED",
      icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      label: "Match Precision",
      value: `${Math.round(kpis.precision * 100)}%`,
      sub: "Confidence in selected links",
      pill: "pill-blue",
      pillText: "PRECISION",
      icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25",
    },
    {
      label: "Recall Coverage",
      value: `${Math.round(kpis.recall * 100)}%`,
      sub: "Ground truth links captured",
      pill: "pill-blue",
      pillText: "RECALL",
      icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z",
    },
    {
      label: "F1 Score",
      value: `${Math.round(kpis.f1 * 100)}%`,
      sub: "Combined accuracy index",
      pill: kpis.f1 >= 0.9 ? "pill-green" : "pill-amber",
      pillText: kpis.f1 >= 0.9 ? "HIGH" : "MEDIUM",
      icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    },
    {
      label: "Unresolved Discrepancies",
      value: kpis.exception_count.toLocaleString(),
      sub: "Awaiting auditor review",
      pill: kpis.exception_count > 0 ? "pill-amber" : "pill-green",
      pillText: kpis.exception_count > 0 ? "REVIEW QUEUE" : "CLEAR",
      icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
    },
    {
      label: "Liquidity / Cash Position",
      value: currency(kpis.cash_position),
      sub: kpis.cash_position < 0 ? "Net deficit alert" : "Available net cash position",
      pill: kpis.cash_position < 0 ? "pill-red" : "pill-green",
      pillText: kpis.cash_position < 0 ? "DEFICIT" : "SOLVENT",
      icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      label: "Checksum Verification",
      value: kpis.checksum_ok ? "VERIFIED" : "MISMATCH",
      sub: "Mathematical cross-ledger proof",
      pill: kpis.checksum_ok ? "pill-green" : "pill-red",
      pillText: kpis.checksum_ok ? "AUDIT PASS" : "AUDIT FAIL",
      icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    },
  ];

  return (
    <div className="metric-grid">
      {items.map((item, i) => (
        <div key={item.label} className="kpi anim-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</span>
            <span className={`pill ${item.pill} text-[9px]`}>{item.pillText}</span>
          </div>
          <div className="kpi-value">{item.value}</div>
          <div className="kpi-copy">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}
