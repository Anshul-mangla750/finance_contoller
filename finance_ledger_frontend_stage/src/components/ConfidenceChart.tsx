import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfidenceBucket } from "../types";

type Props = {
  calibration: ConfidenceBucket[];
};

export function ConfidenceChart({ calibration }: Props) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="metric-label">Calibration</p>
          <h2 className="mt-1 text-xl font-semibold text-ink-950">Confidence bucket vs actual accuracy</h2>
        </div>
        <p className="max-w-sm text-sm text-ink-600">
          This is the most honest artifact in the dashboard: it shows whether high-confidence claims are actually
          reliable.
        </p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={calibration} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eadfcd" />
            <XAxis dataKey="confidence_bucket" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
            <Tooltip formatter={(value: number) => `${Math.round(value * 100)}%`} />
            <Bar dataKey="actual_accuracy" fill="#2f855a" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

