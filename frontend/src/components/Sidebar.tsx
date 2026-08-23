import type { View } from "../types";

type Props = {
  currentView: View;
  onNavigate: (v: View) => void;
  exceptionCount: number;
  isRunning: boolean;
  isOpen: boolean;
  onClose: () => void;
};

const NAV: { v: View; label: string; sub: string; icon: string }[] = [
  {
    v: "overview",
    label: "Control Center",
    sub: "Overview & metrics",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    v: "matches",
    label: "Matching Graph",
    sub: "Links & evidence",
    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  },
  {
    v: "errors",
    label: "Exception Queue",
    sub: "Audit & approvals",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  },
  {
    v: "ask",
    label: "Audit Intelligence",
    sub: "Cited Q&A copilot",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
  },
];

export function Sidebar({ currentView, onNavigate, exceptionCount, isRunning, isOpen, onClose }: Props) {
  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`sidebar-backdrop ${isOpen ? "sidebar-backdrop-open" : ""}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        {/* Brand Header */}
        <div className="px-4 py-4 border-b border-[#1f2736]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-[#2b364a] bg-[#171e2b] text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-white">Finance Ledger</div>
              <div className="text-[10px] font-medium text-slate-400">Enterprise Control OS</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Modules</div>
          {NAV.map(({ v, label, icon, sub }) => (
            <button
              key={v}
              onClick={() => {
                onNavigate(v);
                onClose();
              }}
              className={`sidebar-link w-full group ${currentView === v ? "sidebar-link-active" : ""}`}
            >
              <svg className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <div className="flex-1 text-left min-w-0">
                <div className="truncate">{label}</div>
                <div className="text-[10px] text-slate-500 truncate">{sub}</div>
              </div>
              {v === "errors" && exceptionCount > 0 && (
                <span className="flex min-w-[18px] items-center justify-center rounded px-1 py-0.5 text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {exceptionCount > 99 ? "99+" : exceptionCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* System Status Box */}
        <div className="border-t border-[#1f2736] p-3 bg-[#0b0e14]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
              <span className="text-[11px] font-medium text-slate-300">
                {isRunning ? "Running Batch..." : "Engine Online"}
              </span>
            </div>
            <span className={`pill text-[10px] ${isRunning ? "pill-amber" : "pill-green"}`}>
              {isRunning ? "BUSY" : "READY"}
            </span>
          </div>

          <div className="space-y-1 text-[10px] text-slate-400">
            <div className="flex items-center justify-between">
              <span>Exceptions:</span>
              <span className="mono text-slate-200">{exceptionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Audit Checksum:</span>
              <span className="text-emerald-400">PASS</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
