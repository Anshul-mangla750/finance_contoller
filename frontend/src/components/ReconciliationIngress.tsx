import { useState } from "react";
import type { UploadReconciliationFiles } from "../api";

type Props = {
  onUpload: (files: UploadReconciliationFiles) => Promise<void>;
  onRunFromFolder: (inputDir: string) => Promise<void>;
  busy?: boolean;
};

const FILE_TYPES: { key: keyof UploadReconciliationFiles; label: string; desc: string }[] = [
  { key: "bankStatement", label: "Bank Statement CSV", desc: "Transactions & settlements" },
  { key: "generalLedger", label: "General Ledger CSV", desc: "Internal ledger journal entries" },
  { key: "invoices", label: "Accounts Receivable CSV", desc: "Customer invoices issued" },
  { key: "bills", label: "Accounts Payable CSV", desc: "Vendor bills & obligations" },
  { key: "groundTruth", label: "Ground Truth (Optional)", desc: "Benchmark verification pairings" },
];

export function ReconciliationIngress({ onUpload, onRunFromFolder, busy = false }: Props) {
  const [mode, setMode] = useState<"files" | "folder">("files");
  const [files, setFiles] = useState<Partial<UploadReconciliationFiles>>({});
  const [folderPath, setFolderPath] = useState("input");
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleFileSelect(key: keyof UploadReconciliationFiles, file: File | null) {
    setFiles((prev) => ({ ...prev, [key]: file ?? undefined }));
  }

  async function handleExecuteUpload() {
    setUploadError(null);
    if (!files.bankStatement || !files.generalLedger || !files.invoices || !files.bills) {
      setUploadError("Bank Statement, General Ledger, Invoices and Bills files are required.");
      return;
    }
    try {
      await onUpload(files as UploadReconciliationFiles);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "File processing failed.");
    }
  }

  async function handleExecuteFolder() {
    setUploadError(null);
    try {
      await onRunFromFolder(folderPath);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Folder ingestion failed.");
    }
  }

  const selectedCount = Object.values(files).filter(Boolean).length;

  return (
    <div className="surface p-5 anim-fade-up">
      <div className="flex flex-col gap-2 border-b border-[#1f2736] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="hero-kicker">DATA INGESTION</div>
          <h3 className="section-title mt-1">Multi-Source Financial Data Ingress</h3>
          <p className="section-sub">Upload CSV datasets or specify directory path to execute automated reconciliation.</p>
        </div>

        <div className="flex items-center gap-1 rounded bg-[#0e121a] p-1 border border-[#1f2736]">
          <button
            onClick={() => setMode("files")}
            className={`btn-xs rounded font-medium ${mode === "files" ? "bg-[#1c2434] text-white font-bold" : "text-slate-400"}`}
          >
            File Upload Mode
          </button>
          <button
            onClick={() => setMode("folder")}
            className={`btn-xs rounded font-medium ${mode === "folder" ? "bg-[#1c2434] text-white font-bold" : "text-slate-400"}`}
          >
            Folder Mode
          </button>
        </div>
      </div>

      {uploadError && <div className="mt-3 rounded border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">{uploadError}</div>}

      {mode === "files" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FILE_TYPES.map(({ key, label, desc }) => {
              const file = files[key];
              return (
                <div key={key} className="rounded-lg border border-[#1f2736] bg-[#0e121a] p-3 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-white">{label}</span>
                    {file && <span className="pill pill-green text-[9px]">SELECTED</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{desc}</p>
                  <label className="mt-3 flex cursor-pointer items-center justify-between rounded border border-[#2b364a] bg-[#131822] px-2.5 py-1.5 hover:bg-[#171e2b]">
                    <span className="truncate text-slate-300 font-mono text-[11px]">
                      {file ? file.name : "Choose file..."}
                    </span>
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => handleFileSelect(key, e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[#1f2736] pt-3">
            <span className="text-xs text-slate-400">
              Selected <span className="mono font-bold text-white">{selectedCount}</span> files
            </span>
            <button
              onClick={() => void handleExecuteUpload()}
              disabled={busy || selectedCount === 0}
              className="btn-primary"
            >
              {busy ? "Processing Ingestion..." : "Upload & Reconcile"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[#1f2736] bg-[#0e121a] p-4 text-xs">
            <div className="font-semibold text-white">Local Directory Path</div>
            <p className="mt-0.5 text-slate-400">Target folder containing normalized CSV financial datasets.</p>
            <input
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="e.g. input/ or data/run_01/"
              className="field mt-3"
            />
          </div>

          <div className="flex items-center justify-between border-t border-[#1f2736] pt-3">
            <span className="text-xs text-slate-400">Source directory: <span className="mono text-white">{folderPath}</span></span>
            <button
              onClick={() => void handleExecuteFolder()}
              disabled={busy || !folderPath.trim()}
              className="btn-primary"
            >
              {busy ? "Reading Folder..." : "Reconcile Folder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
