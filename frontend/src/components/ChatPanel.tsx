import { useEffect, useRef, useState } from "react";
import { askAgent } from "../api";
import type { QAResponse } from "../types";

type Msg = { role: "user" | "ai"; text: string; citations?: string[]; confidence?: QAResponse["confidence"] };
type Props = { onFocusRecord: (id: string) => void };

const SUGGESTIONS = [
  { q: "How many exceptions are there?", icon: "📊" },
  { q: "Which vendor has the most unresolved bills?", icon: "🏢" },
  { q: "Why didn't bank transactions match?", icon: "🏦" },
  { q: "Show me all duplicate suspects.", icon: "📋" },
  { q: "How much cash do we actually have?", icon: "💰" },
  { q: "What is the match rate and precision?", icon: "🎯" },
];

export function ChatPanel({ onFocusRecord }: Props) {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "ai", text: "I'm your grounded finance QA assistant. I answer questions using only indexed reconciliation data. Try a suggestion below or ask anything.",
    confidence: "medium",
  }]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, sending]);

  async function send(text?: string) {
    const t = (text ?? q).trim();
    if (!t || sending) return;
    setSending(true); setQ("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    try {
      const r = await askAgent(t);
      setMsgs((m) => [...m, { role: "ai", text: r.answer, citations: r.cited_record_ids, confidence: r.confidence }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", text: e instanceof Error ? e.message : "Request failed.", confidence: "low" }]);
    } finally { setSending(false); }
  }

  return (
    <div className="solid flex flex-col anim-fade-up" style={{ height: "calc(100vh - 160px)", minHeight: 500 }}>
      {/* Header */}
      <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">AI Reconciliation Agent</h3>
            <p className="text-[11px] text-gray-500">Grounded in your data — every answer cites specific record IDs</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} anim-fade-up`} style={{ animationDelay: `${Math.min(i * 50, 200)}ms` }}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              m.role === "user" ? "bg-[#0f172a] text-white rounded-br-md" : "bg-gray-100 text-gray-900 rounded-bl-md"
            }`}>
              <p className="text-sm leading-6 whitespace-pre-wrap">{m.text}</p>
              {m.confidence && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-gray-400">Confidence:</span>
                  <span className={`pill text-[9px] ${m.confidence === "high" ? "pill-green" : m.confidence === "medium" ? "pill-amber" : "pill-red"}`}>{m.confidence}</span>
                </div>
              )}
              {m.citations?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.citations.map((id) => (
                    <button key={id} className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[10px] mono font-medium text-gray-700 hover:border-emerald-400 hover:text-emerald-600 transition" onClick={() => onFocusRecord(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start anim-fade-in">
            <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 anim-breathe" style={{ animationDelay: "0s" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 anim-breathe" style={{ animationDelay: "0.2s" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 anim-breathe" style={{ animationDelay: "0.4s" }} />
              </div>
              <span className="text-xs text-gray-400">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      {msgs.length <= 1 && (
        <div className="px-5 pb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Try asking</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s.q} disabled={sending} onClick={() => void send(s.q)}
                className="chip hover:scale-[1.02] active:scale-[0.98] transition-transform">
                <span>{s.icon}</span> {s.q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 p-4 flex gap-3 bg-gray-50/50">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about matches, exceptions, invoices..."
          className="field flex-1" onKeyDown={(e) => { if (e.key === "Enter") void send(); }} disabled={sending} />
        <button onClick={() => void send()} disabled={sending} className="btn-green">
          {sending ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
