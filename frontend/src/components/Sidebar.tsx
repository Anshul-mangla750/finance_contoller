import type { ReactNode } from "react";

type View = "overview" | "matches" | "errors" | "ask";

type Props = {
  currentView: View;
  onNavigate: (view: View) => void;
  exceptionCount: number;
  isRunning: boolean;
};

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      {children}
    </svg>
  );
}

const NAV_ITEMS: { view: View; label: string; icon: ReactNode; badge?: number }[] = [
  {
    view: "overview",
    label: "Overview",
    icon: (
      <Icon>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </Icon>
    ),
  },
  {
    view: "matches",
    label: "Matches",
    icon: (
      <Icon>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </Icon>
    ),
  },
  {
    view: "errors",
    label: "Error Analysis",
    icon: (
      <Icon>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </Icon>
    ),
  },
  {
    view: "ask",
    label: "Ask Agent",
    icon: (
      <Icon>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </Icon>
    ),
  },
];

export function Sidebar({ currentView, onNavigate, exceptionCount, isRunning }: Props) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight">AI Finance</div>
            <div className="text-[10px] font-medium text-[#64748b] uppercase tracking-widest">Controller</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <div className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">
          Navigation
        </div>
        {NAV_ITEMS.map(({ view, label, icon, badge }) => {
          const isActive = currentView === view;
          const showBadge = view === "errors" && exceptionCount > 0;
          return (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              className={`sidebar-item w-full ${isActive ? "sidebar-item-active" : ""}`}
            >
              {icon}
              <span className="flex-1 text-left">{label}</span>
              {showBadge && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#ef4444]/20 text-[10px] font-bold text-[#ef4444]">
                  {exceptionCount > 99 ? "99+" : exceptionCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Status Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-[#f59e0b] animate-pulse" : "bg-[#10b981]"}`} />
          <span className="text-xs font-medium text-[#94a3b8]">
            {isRunning ? "Processing..." : "System Ready"}
          </span>
        </div>
        <div className="text-[10px] text-[#475569] leading-relaxed">
          Deterministic-first reconciliation with LLM fallback. 5-layer matching pipeline.
        </div>
      </div>
    </aside>
  );
}
