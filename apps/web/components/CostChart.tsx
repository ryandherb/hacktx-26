"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CurvePoint } from "@/lib/api";

export default function CostChart({
  curve,
  crossover,
}: {
  curve: CurvePoint[];
  crossover: number | null;
}) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="month" label={{ value: "Months", position: "insideBottom", offset: -4 }} />
          <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Legend />
          <Line type="monotone" dataKey="keep_cost" name="Keep & repair" stroke="#ea580c" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="replace_cost" name="Replace" stroke="#2563eb" dot={false} strokeWidth={2} />
          {crossover !== null && (
            <ReferenceLine
              x={crossover}
              stroke="#16a34a"
              strokeDasharray="4 4"
              label={{ value: `Crossover: month ${crossover}`, position: "top" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
