import { useRef, useState } from "react";
import { askAgent } from "../api";
import type { QAResponse } from "../types";

type Message = { role: "user" | "assistant"; text: string; citations?: string[]; confidence?: QAResponse["confidence"] };
type Props = { onFocusRecord: (recordId: string) => void };

const SUGGESTIONS = [
  "How many exceptions are there and what categories?",
  "Which vendor has the most unresolved bills?",
  "Why didn't bank transactions match?",
  "Show me all duplicate suspects.",
  "How much cash do we actually have?",
  "What is the match rate and precision?",
];

export function ChatPanel({ onFocusRecord }: Props) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Message[]>([{
    role: "assistant",
    text: "I'm your grounded finance QA assistant. I answer questions using only the indexed reconciliation data. Try a suggestion below or ask your own question.",
    confidence: "medium",
  }]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function submit(text?: string) {
    const q = (text ?? question).trim();
    if (!q || sending) return;
    setSending(true);
    setQuestion("");
    setHistory((h) => [...h, { role: "user", text: q }]);
    try {
      const r = await askAgent(q);
      setHistory((h) => [...h, { role: "assistant", text: r.answer, citations: r.cited_record_ids, confidence: r.confidence }]);
    } catch (e) {
      setHistory((h) => [...h, { role: "assistant", text: e instanceof Error ? e.message : "Request failed.", confidence: "low" }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  }

  return (
    <div className="card flex flex-col" style={{ height: "calc(100vh - 180px)", minHeight: 500 }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              m.role === "user" ? "bg-[#0f172a] text-white" : "bg-[#f1f5f9] text-[#0f172a]"
            }`}>
              <p className="text-sm leading-6 whitespace-pre-wrap">{m.text}</p>
              {m.confidence && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-[#94a3b8]">Confidence:</span>
                  <span className={`badge text-[9px] ${m.confidence === "high" ? "badge-green" : m.confidence === "medium" ? "badge-amber" : "badge-red"}`}>
                    {m.confidence}
                  </span>
                </div>
              )}
              {m.citations?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.citations.map((id) => (
                    <button key={id} className="rounded-lg border border-[#e2e8f0] bg-white px-2 py-0.5 text-[10px] mono font-medium text-[#334155] hover:border-[#10b981] hover:text-[#10b981] transition"
                      type="button" onClick={() => onFocusRecord(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#f1f5f9] px-4 py-3 text-sm text-[#94a3b8]">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {history.length <= 1 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" disabled={sending} onClick={() => void submit(s)}
              className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-[11px] text-[#64748b] hover:border-[#10b981] hover:text-[#10b981] transition disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#e2e8f0] p-4 flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about matches, exceptions, invoices, cash..."
          className="input flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          disabled={sending}
        />
        <button type="button" onClick={() => void submit()} disabled={sending} className="btn-primary">
          {sending ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
