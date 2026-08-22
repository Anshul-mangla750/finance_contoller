import { useState } from "react";
import type { UploadReconciliationFiles } from "../api";

type Props = { onUpload: (f: UploadReconciliationFiles) => Promise<void>; onRunFromFolder: (dir: string) => Promise<void>; busy: boolean };

export function ReconciliationIngress({ onUpload, onRunFromFolder, busy }: Props) {
  const [bank, setBank] = useState<File | null>(null);
  const [ledger, setLedger] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<File | null>(null);
  const [bills, setBills] = useState<File | null>(null);
  const [gt, setGt] = useState<File | null>(null);
  const [dir, setDir] = useState("input");
  const [status, setStatus] = useState<string | null>(null);

  const canUpload = Boolean(bank && ledger && invoices && bills);

  async function doUpload() {
    if (!canUpload) { setStatus("Select all 4 required files."); return; }
    setStatus("Uploading...");
    try { await onUpload({ bankStatement: bank!, generalLedger: ledger!, invoices: invoices!, bills: bills!, groundTruth: gt }); setStatus("Done!"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Failed."); }
  }

  async function doFolder() {
    setStatus(`Running from ${dir}...`);
    try { await onRunFromFolder(dir.trim() || "input"); setStatus("Done!"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Failed."); }
  }

  const files = [
    { key: "bank", label: "Bank Statement", file: bank, set: setBank, required: true },
    { key: "ledger", label: "General Ledger", file: ledger, set: setLedger, required: true },
    { key: "invoices", label: "Invoices (AR)", file: invoices, set: setInvoices, required: true },
    { key: "bills", label: "Bills (AP)", file: bills, set: setBills, required: true },
    { key: "gt", label: "Ground Truth", file: gt, set: setGt, required: false },
  ] as const;

  return (
    <div className="card p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Data Input</div>
          <h2 className="mt-1 text-xl font-bold text-[#0f172a]">Upload files or run from folder</h2>
          <p className="mt-1 text-xs text-[#94a3b8]">JSON or CSV. Place files in <code className="mono bg-[#f1f5f9] px-1 rounded">input/</code> for repeatable runs.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Upload */}
        <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
          <h3 className="text-sm font-bold text-[#0f172a] mb-4">File Upload</h3>
          <div className="space-y-3">
            {files.map(({ key, label, file, set, required }) => (
              <label key={key} className="block">
                <span className="text-xs font-medium text-[#475569]">
                  {label}{required ? "" : <span className="text-[#94a3b8]"> (optional)</span>}
                </span>
                <input type="file" accept=".json,.csv"
                  onChange={(e) => set(e.target.files?.[0] ?? null)}
                  disabled={busy}
                  className="mt-1 block w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-xs text-[#334155] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0f172a] file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-white hover:file:bg-[#1e293b] disabled:opacity-50"
                />
              </label>
            ))}
          </div>
          <button disabled={busy || !canUpload} onClick={() => void doUpload()}
            className="btn-accent mt-4 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run Uploaded Files"}
          </button>
        </div>

        {/* Folder */}
        <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
          <h3 className="text-sm font-bold text-[#0f172a] mb-4">Folder Mode</h3>
          <p className="text-xs text-[#64748b] leading-5 mb-4">
            Place <code className="mono bg-white px-1 rounded">bank_statement</code>,{" "}
            <code className="mono bg-white px-1 rounded">general_ledger</code>,{" "}
            <code className="mono bg-white px-1 rounded">invoices</code>,{" "}
            <code className="mono bg-white px-1 rounded">bills</code> in one folder.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-[#475569]">Folder path</span>
            <input type="text" value={dir} onChange={(e) => setDir(e.target.value)} disabled={busy}
              className="input mt-1 mono" placeholder="input" />
          </label>
          <button disabled={busy} onClick={() => void doFolder()}
            className="btn-primary mt-4 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run Folder Reconciliation"}
          </button>
        </div>
      </div>

      {status && (
        <p className={`mt-4 text-xs font-medium ${status.includes("Fail") || status.includes("error") ? "text-[#dc2626]" : "text-[#64748b]"}`}>
          {status}
        </p>
      )}
    </div>
  );
}
