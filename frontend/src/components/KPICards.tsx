import type { Kpis } from "../types";

type Props = { kpis: Kpis };

export function KPICards({ kpis }: Props) {
  const items = [
    { label: "Records", value: kpis.records_processed.toLocaleString(), sub: "Total processed", cls: "kpi-slate", icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125", color: "#64748b" },
    { label: "Match Rate", value: `${Math.round(kpis.match_rate * 100)}%`, sub: "Auto-matched / total", cls: "kpi-green", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "#10b981" },
    { label: "Precision", value: `${Math.round(kpis.precision * 100)}%`, sub: "Correct / claimed", cls: "kpi-blue", icon: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25", color: "#3b82f6" },
    { label: "Recall", value: `${Math.round(kpis.recall * 100)}%`, sub: "Found / true", cls: "kpi-purple", icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z", color: "#8b5cf6" },
    { label: "F1 Score", value: `${Math.round(kpis.f1 * 100)}%`, sub: "Harmonic P+R", cls: kpis.f1 >= 0.9 ? "kpi-green" : "kpi-amber", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z", color: kpis.f1 >= 0.9 ? "#10b981" : "#f59e0b" },
    { label: "Exceptions", value: kpis.exception_count.toLocaleString(), sub: "Flagged for review", cls: "kpi-red", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z", color: "#ef4444" },
    { label: "Cash Position", value: `$${Math.abs(kpis.cash_position).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, sub: kpis.cash_position < 0 ? "Net outflow" : "Current", cls: "kpi-amber", icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z", color: "#f59e0b" },
    { label: "Checksum", value: kpis.checksum_ok ? "✓ Pass" : "✗ Fail", sub: "In = Matched + Exc", cls: kpis.checksum_ok ? "kpi-green" : "kpi-red", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", color: kpis.checksum_ok ? "#10b981" : "#ef4444" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, i) => (
        <div key={item.label} className={`solid ${item.cls} anim-fade-up`} style={{ animationDelay: `${i * 60}ms` }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">{item.label}</div>
              <div className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">{item.value}</div>
              <div className="mt-0.5 text-[11px] text-gray-400">{item.sub}</div>
            </div>
            <div className="p-2 rounded-xl bg-gray-50">
              <svg className="w-5 h-5" style={{ color: item.color }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
