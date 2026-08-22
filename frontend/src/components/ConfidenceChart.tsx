import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConfidenceBucket } from "../types";

type Props = { calibration: ConfidenceBucket[] };

const COLORS: Record<string, string> = {
  "0.95-1.0": "#10b981",
  "0.85-0.95": "#34d399",
  "0.75-0.85": "#f59e0b",
  "0.60-0.75": "#f97316",
  "below_0.60": "#ef4444",
};

export function ConfidenceChart({ calibration }: Props) {
  const data = calibration.map((bucket) => ({
    ...bucket,
    fill: COLORS[bucket.confidence_bucket] ?? "#64748b",
    pct: Math.round(bucket.actual_accuracy * 100),
  }));

  if (data.length === 0) {
    return (
      <div className="surface p-5 anim-fade-up" style={{ animationDelay: "0.3s" }}>
        <div className="hero-kicker">Calibration</div>
        <h3 className="section-title mt-3">Confidence vs actual accuracy</h3>
        <p className="section-sub">No calibration buckets are available for the current run.</p>
      </div>
    );
  }

  return (
    <div className="surface p-5 anim-fade-up" style={{ animationDelay: "0.3s" }}>
      <div className="mb-4">
        <div className="hero-kicker">Calibration</div>
        <h3 className="section-title mt-3">Confidence vs actual accuracy</h3>
        <p className="section-sub">High-confidence claims should land in the high-accuracy bands.</p>
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
            <XAxis dataKey="confidence_bucket" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
            />
            <Tooltip
              formatter={(value: number) => [`${Math.round(value * 100)}%`, "Accuracy"]}
              contentStyle={{
                borderRadius: 16,
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "rgba(2, 6, 23, 0.96)",
                color: "#f8fafc",
                fontSize: 12,
              }}
              labelStyle={{ color: "#cbd5e1" }}
            />
            <Bar dataKey="actual_accuracy" radius={[10, 10, 0, 0]}>
              {data.map((bucket, index) => (
                <Cell key={index} fill={bucket.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.map((bucket) => (
          <div key={bucket.confidence_bucket} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: bucket.fill }} />
            <span className="font-medium text-slate-200">{bucket.confidence_bucket}</span>
            <span className="text-slate-500">({bucket.predictions} - {bucket.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
