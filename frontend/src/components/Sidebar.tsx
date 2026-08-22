import type { View } from "../types";

type Props = { currentView: View; onNavigate: (v: View) => void; exceptionCount: number; isRunning: boolean };

const NAV: { v: View; label: string; sub: string; icon: string }[] = [
  { v: "overview", label: "Command Center", sub: "Observe and verify", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" },
  { v: "matches", label: "Matching Graph", sub: "Evidence and links", icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" },
  { v: "errors", label: "Resolution Queue", sub: "Exceptions and approvals", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
  { v: "ask", label: "AI Copilot", sub: "Grounded answers", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
];

export function Sidebar({ currentView, onNavigate, exceptionCount, isRunning }: Props) {
  return (
    <aside className="sidebar">
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/20">
            <svg className="h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-bold tracking-tight text-white">Agentic Finance OS</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-500">Finance Command Center</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="px-3 mb-2 text-[9px] font-bold uppercase tracking-[0.28em] text-slate-600">Navigation</div>
        {NAV.map(({ v, label, icon, sub }) => (
          <button key={v} onClick={() => onNavigate(v)} className={`sidebar-link w-full group ${currentView === v ? "sidebar-link-active" : ""}`}>
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            <div className="flex-1 text-left">
              <div>{label}</div>
              {currentView !== v && <div className="text-[10px] text-slate-500 group-hover:text-slate-400">{sub}</div>}
            </div>
            {v === "errors" && exceptionCount > 0 && (
              <span className="flex min-w-[20px] items-center justify-center rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                {exceptionCount > 99 ? "99+" : exceptionCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-white/5 px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            <div className={`h-2 w-2 rounded-full ${isRunning ? "bg-amber-300" : "bg-emerald-300"}`} />
            {isRunning && <div className="absolute inset-0 h-2 w-2 rounded-full bg-amber-300" style={{ animation: "pulse-ring 1.5s infinite" }} />}
          </div>
          <span className="text-[11px] font-medium text-slate-300">{isRunning ? "Processing live data" : "System ready"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`pill ${isRunning ? "pill-amber" : "pill-green"}`}>{isRunning ? "Live" : "Idle"}</span>
          {exceptionCount > 0 ? <span className="pill pill-red">{exceptionCount} exceptions</span> : <span className="pill pill-green">No open exceptions</span>}
        </div>
        <div className="mt-3 text-[9px] leading-relaxed text-slate-500">Observe - understand - decide - act - verify.</div>
      </div>
    </aside>
  );
}
