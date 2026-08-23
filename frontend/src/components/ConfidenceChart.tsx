import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConfidenceBucket } from "../types";

type Props = { calibration: ConfidenceBucket[] };

const BUCKET_COLORS: Record<string, string> = {
  "0.95-1.0": "#10b981",
  "0.85-0.95": "#3b82f6",
  "0.75-0.85": "#f59e0b",
  "0.60-0.75": "#f97316",
  "below_0.60": "#ef4444",
};

export function ConfidenceChart({ calibration }: Props) {
  const data = calibration.map((bucket) => ({
    ...bucket,
    fill: BUCKET_COLORS[bucket.confidence_bucket] ?? "#64748b",
    pct: Math.round(bucket.actual_accuracy * 100),
  }));

  if (data.length === 0) {
    return (
      <div className="surface p-5 anim-fade-up">
        <div className="hero-kicker">CALIBRATION ENGINE</div>
        <h3 className="section-title mt-2">Confidence vs. Actual Accuracy Calibration</h3>
        <p className="section-sub">No calibration data available for current batch.</p>
      </div>
    );
  }

  return (
    <div className="surface p-5 anim-fade-up">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="hero-kicker">MODEL CALIBRATION</div>
          <h3 className="section-title mt-1">Confidence Score vs. Verified Accuracy</h3>
          <p className="section-sub">Measures statistical alignment between estimated model confidence and empirical ground truth.</p>
        </div>
        <span className="pill pill-slate">CALIBRATED</span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#1f2736" vertical={false} />
            <XAxis
              dataKey="confidence_bucket"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "Roboto, sans-serif" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
              tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "Roboto Mono, monospace" }}
            />
            <Tooltip
              formatter={(value: number) => [`${Math.round(value * 100)}%`, "Accuracy"]}
              contentStyle={{
                borderRadius: 6,
                border: "1px solid #2b364a",
                background: "#0e121a",
                color: "#f8fafc",
                fontSize: 12,
                fontFamily: "Roboto, sans-serif",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ color: "#94a3b8", fontWeight: 600 }}
            />
            <Bar dataKey="actual_accuracy" radius={[4, 4, 0, 0]}>
              {data.map((bucket, index) => (
                <Cell key={index} fill={bucket.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 border-t border-[#1f2736] pt-3">
        {data.map((bucket) => (
          <div key={bucket.confidence_bucket} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bucket.fill }} />
            <span className="font-mono font-medium text-slate-200">{bucket.confidence_bucket}:</span>
            <span className="text-slate-400">{bucket.predictions} predictions ({bucket.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
