import { useState } from "react";
import type { UploadReconciliationFiles } from "../api";

type Props = {
  onUpload: (f: UploadReconciliationFiles) => Promise<void>;
  onRunFromFolder: (dir: string) => Promise<void>;
  busy: boolean;
};

export function ReconciliationIngress({ onUpload, onRunFromFolder, busy }: Props) {
  const [bank, setBank] = useState<File | null>(null);
  const [ledger, setLedger] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<File | null>(null);
  const [bills, setBills] = useState<File | null>(null);
  const [groundTruth, setGroundTruth] = useState<File | null>(null);
  const [dir, setDir] = useState("input");
  const [status, setStatus] = useState<string | null>(null);

  const canUpload = Boolean(bank && ledger && invoices && bills);

  async function doUpload() {
    if (!canUpload) {
      setStatus("Select all four required files.");
      return;
    }

    setStatus("Uploading...");
    try {
      await onUpload({
        bankStatement: bank!,
        generalLedger: ledger!,
        invoices: invoices!,
        bills: bills!,
        groundTruth,
      });
      setStatus("Done.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed.");
    }
  }

  async function doFolder() {
    setStatus(`Running from ${dir}...`);
    try {
      await onRunFromFolder(dir.trim() || "input");
      setStatus("Done.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed.");
    }
  }

  const files = [
    { key: "bank", label: "Bank Statement", file: bank, setFile: setBank, required: true },
    { key: "ledger", label: "General Ledger", file: ledger, setFile: setLedger, required: true },
    { key: "invoices", label: "Invoices (AR)", file: invoices, setFile: setInvoices, required: true },
    { key: "bills", label: "Bills (AP)", file: bills, setFile: setBills, required: true },
    { key: "groundTruth", label: "Ground Truth", file: groundTruth, setFile: setGroundTruth, required: false },
  ];

  return (
    <div className="surface p-5 anim-fade-up">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-400/25 to-cyan-400/15">
            <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <div className="hero-kicker">Operational Ingress</div>
            <h3 className="mt-2 text-sm font-bold text-white">Bring records into the command center</h3>
          </div>
        </div>
        <span className={`pill ${busy ? "pill-amber" : "pill-green"}`}>{busy ? "Running" : "Ready"}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
        <div className="agent-card">
          <div className="section-head">
            <div>
              <div className="hero-kicker">File Upload</div>
              <p className="section-sub">Upload bank, ledger, invoice, and bill data to populate the current run.</p>
            </div>
          </div>

          <div className="space-y-3">
            {files.map(({ key, label, file, setFile, required }) => (
              <label key={key} className="block">
                <span className="text-[11px] font-medium text-slate-300">
                  {label}
                  {!required && <span className="text-slate-500"> (optional)</span>}
                </span>
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={busy}
                  className="mt-1 block w-full rounded-2xl border border-white/5 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300 file:mr-2 file:rounded-xl file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-slate-950 hover:file:bg-emerald-400 disabled:opacity-50"
                />
                {file && <div className="mt-1 text-[10px] text-emerald-300">{file.name}</div>}
              </label>
            ))}
          </div>

          <button disabled={busy || !canUpload} onClick={() => void doUpload()} className="btn-green mt-4 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run uploaded files"}
          </button>
        </div>

        <div className="agent-card">
          <div className="section-head">
            <div>
              <div className="hero-kicker">Folder Mode</div>
              <p className="section-sub">Point the app at a folder and replay the same workflow without uploading files.</p>
            </div>
          </div>

          <p className="mb-3 text-[11px] leading-5 text-slate-400">
            Place <code className="mono rounded bg-slate-950/80 px-1 text-[10px]">bank_statement</code>,{" "}
            <code className="mono rounded bg-slate-950/80 px-1 text-[10px]">general_ledger</code>,{" "}
            <code className="mono rounded bg-slate-950/80 px-1 text-[10px]">invoices</code>, and{" "}
            <code className="mono rounded bg-slate-950/80 px-1 text-[10px]">bills</code> in one folder.
          </p>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-300">Folder path</span>
            <input
              type="text"
              value={dir}
              onChange={(event) => setDir(event.target.value)}
              disabled={busy}
              className="field mt-1 mono text-[11px]"
              placeholder="input"
            />
          </label>

          <button disabled={busy} onClick={() => void doFolder()} className="btn-outline mt-4 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run folder reconciliation"}
          </button>
        </div>
      </div>

      {status && <p className={`mt-3 text-[11px] font-medium ${status.toLowerCase().includes("fail") ? "text-rose-300" : "text-slate-400"}`}>{status}</p>}
    </div>
  );
}
