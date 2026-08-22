import { useState } from "react";
import { askAgent } from "../api";
import type { QAResponse } from "../types";

type Message = {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  confidence?: QAResponse["confidence"];
};

type Props = {
  onFocusRecord: (recordId: string) => void;
};

export function ChatPanel({ onFocusRecord }: Props) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask about unpaid invoices, exception reasons, or unreconciled exposure.",
      confidence: "medium",
    },
  ]);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setQuestion("");
    setHistory((current) => [...current, { role: "user", text: trimmed }]);
    try {
      const response = await askAgent(trimmed);
      setHistory((current) => [
        ...current,
        { role: "assistant", text: response.answer, citations: response.cited_record_ids, confidence: response.confidence },
      ]);
    } catch (error) {
      setHistory((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "Agent request failed.",
          confidence: "low",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel flex min-h-[70vh] flex-col p-5">
      <div className="mb-4">
        <p className="metric-label">Ask the Agent</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink-950">Grounded reconciliation Q&A</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {history.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl rounded-3xl px-4 py-3 ${message.role === "user" ? "bg-ink-950 text-white" : "bg-sand-100 text-ink-800"}`}>
              <p className="text-sm leading-6">{message.text}</p>
              {message.confidence ? (
                <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-ink-500">Confidence: {message.confidence}</div>
              ) : null}
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.citations.map((id) => (
                    <button key={id} className="chip mono" type="button" onClick={() => onFocusRecord(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which invoices from Acme are still unpaid?"
          className="flex-1 rounded-full border border-sand-200 bg-white px-5 py-3 text-sm outline-none transition placeholder:text-ink-400 focus:border-moss-400"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleSubmit();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          className="rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-moss-500 disabled:opacity-60"
          disabled={sending}
        >
          {sending ? "Asking..." : "Ask"}
        </button>
      </div>
    </div>
  );
}

