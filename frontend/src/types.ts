export type ConfidenceBucket = {
  confidence_bucket: string;
  predictions: number;
  actual_accuracy: number;
};

export type View = "overview" | "matches" | "errors" | "ask";

export type Kpis = {
  records_processed: number;
  match_rate: number;
  precision: number;
  recall: number;
  f1: number;
  cash_position: number;
  exception_count: number;
  checksum_ok: boolean;
};

export type AccuracyReport = {
  available: boolean;
  overall_match_rate: number;
  precision: number;
  recall: number;
  f1: number;
  per_pair: Record<string, PairMetrics>;
  calibration_table: ConfidenceBucket[];
  checksum: ChecksumReport;
  total_records: number;
  matched_count: number;
  exception_count: number;
  cash_position: number;
};

export type PairMetrics = {
  truth_count: number;
  predicted_count: number;
  correct_count: number;
  precision: number;
  recall: number;
  f1: number;
  match_rate: number;
};

export type ChecksumReport = Record<string, { total: number; matched: number; exceptions: number; ok: boolean }> & {
  ok: boolean;
};

export type MatchRow = {
  id?: number;
  run_id?: string;
  source_a_type: string;
  source_a_id: string;
  source_b_type: string;
  source_b_id: string;
  match_layer: number;
  match_kind: string;
  confidence: number;
  reasoning: string;
  pair_type?: string;
  evidence_json?: string | null;
  created_at?: string;
};

export type ExceptionRow = {
  id?: number;
  run_id?: string;
  source_type: string;
  record_id: string;
  best_candidate_type: string | null;
  best_candidate_id: string | null;
  best_candidate_confidence: number | null;
  reason_category: string;
  status: string;
  explanation: string;
  suggested_action: string;
  evidence_json?: string | null;
  review_status?: string;
  review_notes?: string | null;
  reviewed_by?: string | null;
  created_at?: string;
};

export type GroundedExplanation = {
  explanation: string;
  confidence: number;
  evidence_summary: string;
  possible_causes: string[];
  recommended_action: string;
  certainty: "confirmed_fact" | "likely_explanation" | "unknown";
};

export type ErrorExplanationResponse = {
  record_id: string;
  run_id: string;
  status: string;
  structured_evidence: Record<string, unknown>;
  ai_available: boolean;
  ai_explanation: GroundedExplanation;
  record_details: Record<string, unknown>;
};

export type ExceptionGroup = {
  category: string;
  label: string;
  description: string;
  items: ExceptionRow[];
};

export type QAResponse = {
  answer: string;
  cited_record_ids: string[];
  confidence: "high" | "medium" | "low";
};

export type ReconcileResponse = {
  run_id: string;
  kpis: Kpis;
  accuracy: AccuracyReport;
  matches: MatchRow[];
  exceptions: ExceptionRow[];
};
