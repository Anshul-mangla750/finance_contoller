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
    try { await onUpload({ bankStatement: bank!, generalLedger: ledger!, invoices: invoices!, bills: bills!, groundTruth: gt }); setStatus("✓ Done!"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Failed."); }
  }

  async function doFolder() {
    setStatus(`Running from ${dir}...`);
    try { await onRunFromFolder(dir.trim() || "input"); setStatus("✓ Done!"); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Failed."); }
  }

  const files = [
    { key: "bank", label: "Bank Statement", file: bank, set: setBank, req: true },
    { key: "ledger", label: "General Ledger", file: ledger, set: setLedger, req: true },
    { key: "inv", label: "Invoices (AR)", file: invoices, set: setInvoices, req: true },
    { key: "bill", label: "Bills (AP)", file: bills, set: setBills, req: true },
    { key: "gt", label: "Ground Truth", file: gt, set: setGt, req: false },
  ];

  return (
    <div className="solid p-5 anim-fade-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Data Input</h3>
          <p className="text-[11px] text-gray-500">Upload files or run from folder</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <h4 className="text-xs font-bold text-gray-700 mb-3">File Upload</h4>
          <div className="space-y-2.5">
            {files.map(({ key, label, file, set, req }) => (
              <label key={key} className="block">
                <span className="text-[11px] font-medium text-gray-600">{label}{!req && <span className="text-gray-400"> (opt)</span>}</span>
                <input type="file" accept=".json,.csv" onChange={(e) => set(e.target.files?.[0] ?? null)} disabled={busy}
                  className="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-700 file:mr-2 file:rounded-md file:border-0 file:bg-gray-900 file:px-2.5 file:py-1 file:text-[10px] file:font-semibold file:text-white hover:file:bg-gray-700 disabled:opacity-50" />
              </label>
            ))}
          </div>
          <button disabled={busy || !canUpload} onClick={() => void doUpload()} className="btn-green mt-3 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run Uploaded Files"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <h4 className="text-xs font-bold text-gray-700 mb-3">Folder Mode</h4>
          <p className="text-[11px] text-gray-500 leading-4 mb-3">Place <code className="mono bg-white px-1 rounded text-[10px]">bank_statement</code>, <code className="mono bg-white px-1 rounded text-[10px]">general_ledger</code>, <code className="mono bg-white px-1 rounded text-[10px]">invoices</code>, <code className="mono bg-white px-1 rounded text-[10px]">bills</code> in one folder.</p>
          <label className="block">
            <span className="text-[11px] font-medium text-gray-600">Folder path</span>
            <input type="text" value={dir} onChange={(e) => setDir(e.target.value)} disabled={busy} className="field mt-1 mono text-[11px]" placeholder="input" />
          </label>
          <button disabled={busy} onClick={() => void doFolder()} className="btn-dark mt-3 w-full disabled:opacity-50">
            {busy ? "Running..." : "Run Folder Reconciliation"}
          </button>
        </div>
      </div>

      {status && <p className={`mt-3 text-[11px] font-medium ${status.includes("Fail") ? "text-red-500" : "text-gray-500"}`}>{status}</p>}
    </div>
  );
}
