import { useEffect, useRef, useState } from "react";
import { askAgent } from "../api";
import type { QAResponse } from "../types";

type Msg = { role: "user" | "ai"; text: string; citations?: string[]; confidence?: QAResponse["confidence"] };
type Props = { onFocusRecord: (id: string) => void };

const SUGGESTIONS = [
  { q: "Why is today's settlement lower than expected?", tag: "SETTLEMENT" },
  { q: "Which transactions are unreconciled?", tag: "MATCH" },
  { q: "How much cash will we have next Friday?", tag: "CASH" },
  { q: "Find suspicious duplicate payments.", tag: "RISK" },
  { q: "What should I investigate first?", tag: "QUEUE" },
  { q: "Which invoices are missing payment?", tag: "AR" },
];

export function ChatPanel({ onFocusRecord }: Props) {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Ask about settlements, exceptions, cash, or tax. I answer from the current run and cite record IDs when available.",
      confidence: "medium",
    },
  ]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, sending]);

  async function send(text?: string) {
    const prompt = (text ?? q).trim();
    if (!prompt || sending) return;

    setSending(true);
    setQ("");
    setMsgs((current) => [...current, { role: "user", text: prompt }]);

    try {
      const response = await askAgent(prompt);
      setMsgs((current) => [
        ...current,
        { role: "ai", text: response.answer, citations: response.cited_record_ids, confidence: response.confidence },
      ]);
    } catch (error) {
      setMsgs((current) => [
        ...current,
        { role: "ai", text: error instanceof Error ? error.message : "Request failed.", confidence: "low" },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="surface flex flex-col anim-fade-up" style={{ minHeight: 620 }}>
      <div className="border-b border-white/5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-slate-500/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-lg shadow-emerald-500/20">
            <svg className="h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">AI Finance Copilot</h3>
            <p className="text-[11px] text-slate-400">Grounded in the current run. Every answer includes cited record IDs when available.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {msgs.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} anim-fade-up`}
            style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
          >
            <div
              className={`max-w-[82%] rounded-3xl px-4 py-3 ${
                message.role === "user"
                  ? "rounded-br-md bg-gradient-to-br from-emerald-500 to-cyan-500 text-slate-950"
                  : "rounded-bl-md border border-white/5 bg-white/5 text-slate-100"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
              {message.confidence && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500">Confidence:</span>
                  <span className={`pill text-[9px] ${message.confidence === "high" ? "pill-green" : message.confidence === "medium" ? "pill-amber" : "pill-red"}`}>
                    {message.confidence}
                  </span>
                </div>
              )}
              {message.citations?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.citations.map((id) => (
                    <button key={id} className="chip mono text-[10px] font-medium" onClick={() => onFocusRecord(id)}>
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
            <div className="flex items-center gap-2 rounded-3xl rounded-bl-md border border-white/5 bg-white/5 px-4 py-3">
              <div className="flex gap-1">
                <div className="anim-breathe h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0s" }} />
                <div className="anim-breathe h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0.2s" }} />
                <div className="anim-breathe h-1.5 w-1.5 rounded-full bg-slate-400" style={{ animationDelay: "0.4s" }} />
              </div>
              <span className="text-xs text-slate-400">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {msgs.length <= 1 && (
        <div className="px-5 pb-2">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Try asking</div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.q}
                disabled={sending}
                onClick={() => void send(suggestion.q)}
                className="chip hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <span className="text-[9px] uppercase tracking-[0.16em] text-slate-400">{suggestion.tag}</span>
                <span className="text-slate-300">{suggestion.q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-white/5 bg-slate-950/40 p-4">
        <div className="flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about settlements, exceptions, cash, or tax..."
            className="field flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            disabled={sending}
          />
          <button onClick={() => void send()} disabled={sending} className="btn-green">
            {sending ? "..." : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}
