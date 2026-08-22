import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConfidenceBucket } from "../types";

type Props = { calibration: ConfidenceBucket[] };

const COLORS: Record<string, string> = {
  "0.95-1.0": "#10b981", "0.85-0.95": "#34d399", "0.75-0.85": "#f59e0b", "0.60-0.75": "#f97316", "below_0.60": "#ef4444",
};

export function ConfidenceChart({ calibration }: Props) {
  const data = calibration.map((b) => ({ ...b, fill: COLORS[b.confidence_bucket] ?? "#64748b", pct: Math.round(b.actual_accuracy * 100) }));

  return (
    <div className="solid p-5 anim-fade-up" style={{ animationDelay: "0.3s" }}>
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Calibration</div>
        <h3 className="mt-1 text-lg font-bold text-gray-900">Confidence vs Actual Accuracy</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">High-confidence claims should have high actual accuracy.</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="confidence_bucket" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip formatter={(v: number) => [`${Math.round(v * 100)}%`, "Accuracy"]} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
            <Bar dataKey="actual_accuracy" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.map((d) => (
          <div key={d.confidence_bucket} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="font-medium">{d.confidence_bucket}</span>
            <span className="text-gray-400">({d.predictions} · {d.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
