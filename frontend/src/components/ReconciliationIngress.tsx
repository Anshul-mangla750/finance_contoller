import { useState } from "react";
import type { UploadReconciliationFiles } from "../api";

type Props = {
  onUpload: (files: UploadReconciliationFiles) => Promise<void>;
  onRunFromFolder: (inputDir: string) => Promise<void>;
  busy: boolean;
};

export function ReconciliationIngress({ onUpload, onRunFromFolder, busy }: Props) {
  const [bankStatement, setBankStatement] = useState<File | null>(null);
  const [generalLedger, setGeneralLedger] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<File | null>(null);
  const [bills, setBills] = useState<File | null>(null);
  const [groundTruth, setGroundTruth] = useState<File | null>(null);
  const [inputDir, setInputDir] = useState("input");
  const [status, setStatus] = useState<string | null>(null);

  const canUpload = Boolean(bankStatement && generalLedger && invoices && bills);

  async function handleUpload() {
    if (!bankStatement || !generalLedger || !invoices || !bills) {
      setStatus("Please select bank_statement, general_ledger, invoices, and bills first.");
      return;
    }
    setStatus("Uploading and reconciling...");
    try {
      await onUpload({
        bankStatement,
        generalLedger,
        invoices,
        bills,
        groundTruth,
      });
      setStatus("Uploaded files reconciled successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function handleFolderRun() {
    setStatus(`Running folder mode from ${inputDir}...`);
    try {
      await onRunFromFolder(inputDir.trim() || "input");
      setStatus("Folder reconciliation completed successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Folder run failed.");
    }
  }

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="metric-label">Bring your own data</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink-950">
            Upload once or rerun from <code className="mono">input/</code>
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            Each file can be JSON or CSV. If you prefer a repeatable local drop folder, place the four source files
            in <code className="mono">input/</code> and use folder mode instead of multipart uploads.
          </p>
        </div>
        <div className="rounded-full bg-sand-100 px-4 py-2 text-xs font-medium text-ink-600">
          Supported: JSON and CSV
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-sand-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-ink-950">File upload</h3>
          <div className="mt-4 grid gap-4">
            {[
              ["bank_statement", "Bank statement"],
              ["general_ledger", "General ledger"],
              ["invoices", "Invoices"],
              ["bills", "Bills"],
              ["ground_truth", "Ground truth (optional)"],
            ].map(([key, label]) => {
              const isOptional = key === "ground_truth";
              const id = `recon-${key}`;
              return (
                <label key={key} htmlFor={id} className="grid gap-2">
                  <span className="text-sm font-medium text-ink-700">
                    {label}
                    {isOptional ? " " : ""}
                    {isOptional ? <span className="text-ink-400">(optional)</span> : null}
                  </span>
                  <input
                    id={id}
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (key === "bank_statement") setBankStatement(file);
                      if (key === "general_ledger") setGeneralLedger(file);
                      if (key === "invoices") setInvoices(file);
                      if (key === "bills") setBills(file);
                      if (key === "ground_truth") setGroundTruth(file);
                    }}
                    disabled={busy}
                    className="block w-full rounded-2xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-700 file:mr-4 file:rounded-full file:border-0 file:bg-ink-950 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-moss-500 disabled:cursor-not-allowed"
                  />
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={busy || !canUpload}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-moss-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-moss-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Running..." : "Run uploaded files"}
          </button>
        </section>

        <section className="rounded-3xl border border-sand-200 bg-white p-5">
          <h3 className="text-lg font-semibold text-ink-950">Folder mode</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Put <code className="mono">bank_statement</code>, <code className="mono">general_ledger</code>,
            <code className="mono">invoices</code>, and <code className="mono">bills</code> into one folder as JSON or
            CSV, then run against that folder without uploading again.
          </p>
          <label className="mt-4 grid gap-2">
            <span className="text-sm font-medium text-ink-700">Input folder</span>
            <input
              type="text"
              value={inputDir}
              onChange={(event) => setInputDir(event.target.value)}
              disabled={busy}
              className="rounded-2xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-ink-700 outline-none transition focus:border-moss-400"
              placeholder="input"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleFolderRun()}
            disabled={busy}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-moss-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Running..." : "Run folder reconciliation"}
          </button>
          <p className="mt-3 text-xs leading-5 text-ink-500">
            The backend accepts relative paths like <code className="mono">input</code> or an absolute local path if
            you want to point at a
            different drop folder.
          </p>
        </section>
      </div>

      {status ? <p className="mt-4 text-sm text-ink-600">{status}</p> : null}
    </div>
  );
}
