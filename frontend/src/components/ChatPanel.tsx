import { useState } from "react";
import { askAgent } from "../api";

type Props = { onFocusRecord: (id: string) => void };

type Message = {
  id: string;
  sender: "user" | "agent";
  text: string;
  citedRecords?: string[];
  timestamp: string;
};

const SUGGESTED_QUERIES = [
  "Summarize top reconciliation exceptions and root causes",
  "Check cash position solvency and net balance",
  "Which records failed arithmetic checksum verification?",
  "List high confidence match pairs formed in Layer 1",
];

export function ChatPanel({ onFocusRecord }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "agent",
      text: "Financial Audit Assistant initialized. I am ready to query the live ledger batch, cross-verify settlement links, and retrieve evidence citations.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend(textToSend?: string) {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      const response = await askAgent(query);
      const agentMsg: Message = {
        id: `agent-${Date.now()}`,
        sender: "agent",
        text: response.answer,
        citedRecords: response.cited_record_ids,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: "agent",
          text: err instanceof Error ? `Error: ${err.message}` : "Failed to retrieve query response.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#1f2736] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="hero-kicker">AUDIT INTELLIGENCE</div>
            <h3 className="section-title mt-1">Financial Operations Audit Assistant</h3>
            <p className="section-sub">
              Grounded audit query engine with direct ledger citations and evidence trace verification.
            </p>
          </div>
          <span className="pill pill-green text-[10px]">GROUNDED RETRIEVAL ONLINE</span>
        </div>
      </div>

      {/* Suggested Prompt Chips */}
      <div className="border-b border-[#1f2736] bg-[#0e121a] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">AUDIT PROMPT TEMPLATES</div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUERIES.map((prompt) => (
            <button
              key={prompt}
              disabled={loading}
              onClick={() => void handleSend(prompt)}
              className="chip text-[11px]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Transcript */}
      <div className="p-4 space-y-4 max-h-[520px] overflow-y-auto bg-[#0b0e14]">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-1.5 anim-fade-up">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className={`mono font-bold uppercase ${msg.sender === "user" ? "text-blue-400" : "text-emerald-400"}`}>
                {msg.sender === "user" ? "AUDITOR QUERY" : "AUDIT INTELLIGENCE"}
              </span>
              <span>•</span>
              <span className="mono">{msg.timestamp}</span>
            </div>

            <div
              className={`rounded-lg p-3.5 text-xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-[#171e2b] border border-[#2b364a] text-white"
                  : "bg-[#131822] border border-[#1f2736] text-slate-200"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.citedRecords && msg.citedRecords.length > 0 && (
                <div className="mt-3 border-t border-[#1f2736] pt-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    CITED LEDGER RECORDS
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citedRecords.map((recordId) => (
                      <button
                        key={recordId}
                        onClick={() => onFocusRecord(recordId)}
                        className="chip mono text-[10px] border-blue-500/40 text-blue-300"
                      >
                        {recordId}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="rounded-lg border border-[#1f2736] bg-[#131822] p-3 text-xs text-slate-400 anim-shimmer">
            Retrieving grounded audit evidence from live ledger database...
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="border-t border-[#1f2736] bg-[#0e121a] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a financial audit question (e.g. Why did record bank_104 fail amount matching?)..."
            className="field flex-1"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="btn-primary">
            {loading ? "Querying..." : "Submit Query"}
          </button>
        </form>
      </div>
    </div>
  );
}
