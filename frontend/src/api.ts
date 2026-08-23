import type { AuditLogResponse, ErrorExplanationResponse, QAResponse, ReconcileResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const shouldSetJsonContentType =
    init?.body !== undefined && !(typeof FormData !== "undefined" && init.body instanceof FormData);
  const response = await fetch(input, {
    headers: {
      ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected JSON from the API, but got ${contentType || "unknown content type"}. ` +
        `Check that the backend is running and that VITE_API_BASE_URL is correct. ` +
        (preview ? `Response preview: ${preview}` : ""),
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `The API returned invalid JSON. Check that the backend route is responding correctly. ` +
        (preview ? `Response preview: ${preview}` : ""),
    );
  }
}

async function requestMultipart<T>(input: RequestInfo | URL, formData: FormData): Promise<T> {
  const response = await fetch(input, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected JSON from the API, but got ${contentType || "unknown content type"}. ` +
        `Check that the backend route is responding correctly. ` +
        (preview ? `Response preview: ${preview}` : ""),
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `The API returned invalid JSON. Check that the backend route is responding correctly. ` +
        (preview ? `Response preview: ${preview}` : ""),
    );
  }
}

export function loadLatestRun(): Promise<ReconcileResponse> {
  return requestJson<ReconcileResponse>(apiUrl("/api/dashboard/latest-run"));
}

export function runReconciliation(): Promise<ReconcileResponse> {
  return requestJson<ReconcileResponse>(apiUrl("/api/reconcile/run"), { method: "POST" });
}

export function runFolderReconciliation(inputDir?: string): Promise<ReconcileResponse> {
  return requestJson<ReconcileResponse>(apiUrl("/api/reconcile/run-folder"), {
    method: "POST",
    body: inputDir ? JSON.stringify({ input_dir: inputDir }) : undefined,
  });
}

export type UploadReconciliationFiles = {
  bankStatement: File;
  generalLedger: File;
  invoices: File;
  bills: File;
  groundTruth?: File | null;
};

export function uploadReconciliation(files: UploadReconciliationFiles): Promise<ReconcileResponse> {
  const formData = new FormData();
  formData.append("bank_statement", files.bankStatement);
  formData.append("general_ledger", files.generalLedger);
  formData.append("invoices", files.invoices);
  formData.append("bills", files.bills);
  if (files.groundTruth) {
    formData.append("ground_truth", files.groundTruth);
  }
  return requestMultipart<ReconcileResponse>(apiUrl("/api/reconcile/upload"), formData);
}

export function askAgent(question: string): Promise<QAResponse> {
  return requestJson<QAResponse>(apiUrl("/api/qa/ask"), {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function fetchErrorExplanation(recordId: string): Promise<ErrorExplanationResponse> {
  return requestJson<ErrorExplanationResponse>(apiUrl(`/api/reconcile/evidence/${encodeURIComponent(recordId)}`));
}

export function reviewException(payload: {
  record_id: string;
  action: string;
  notes?: string;
  reviewer_name?: string;
}): Promise<{ success: boolean; record: Record<string, unknown> }> {
  return requestJson<{ success: boolean; record: Record<string, unknown> }>(apiUrl("/api/reconcile/review"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAuditLogs(limit = 5): Promise<AuditLogResponse> {
  return requestJson<AuditLogResponse>(apiUrl(`/api/dashboard/audit-logs?limit=${encodeURIComponent(limit)}`));
}
