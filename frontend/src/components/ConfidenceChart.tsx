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
  const data = calibration.map((b) => ({
    ...b,
    fill: COLORS[b.confidence_bucket] ?? "#64748b",
    pct: Math.round(b.actual_accuracy * 100),
  }));

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Calibration</div>
        <h2 className="mt-1 text-lg font-bold text-[#0f172a]">Confidence vs Actual Accuracy</h2>
        <p className="mt-1 text-xs text-[#94a3b8]">
          High-confidence predictions should have high actual accuracy — proves the model isn't guessing.
        </p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="confidence_bucket" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              tick={{ fontSize: 11, fill: "#64748b" }}
            />
            <Tooltip
              formatter={(v: number) => [`${Math.round(v * 100)}%`, "Accuracy"]}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
            />
            <Bar dataKey="actual_accuracy" radius={[8, 8, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {data.map((d) => (
          <div key={d.confidence_bucket} className="flex items-center gap-1.5 text-[11px] text-[#64748b]">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="font-medium">{d.confidence_bucket}</span>
            <span className="text-[#94a3b8]">({d.predictions} · {d.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
