export type ConfidenceBucket = {
  confidence_bucket: string;
  predictions: number;
  actual_accuracy: number;
};

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
  overall_match_rate: number;
  precision: number;
  recall: number;
  f1: number;
  per_pair: Record<string, Record<string, number>>;
  calibration_table: ConfidenceBucket[];
  checksum: Record<string, any>;
  total_records: number;
  matched_count: number;
  exception_count: number;
  cash_position: number;
};

export type MatchRow = {
  id?: number;
  source_a_type: string;
  source_a_id: string;
  source_b_type: string;
  source_b_id: string;
  match_layer: number;
  match_kind: string;
  confidence: number;
  reasoning: string;
  pair_type: string;
};

export type ExceptionRow = {
  id?: number;
  source_type: string;
  record_id: string;
  best_candidate_type: string | null;
  best_candidate_id: string | null;
  best_candidate_confidence: number | null;
  reason_category: string;
  explanation: string;
  suggested_action: string;
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

