"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface GrowthPoint {
  collectedAt: string;
  vph: number;
  growthPercent: number;
}

export function VideoGrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="collectedAt" tickFormatter={(value: string) => value.slice(5, 16)} />
        <YAxis yAxisId="vph" />
        <YAxis yAxisId="growth" orientation="right" />
        <Tooltip />
        <Legend />
        <Line yAxisId="vph" type="monotone" dataKey="vph" name="Views/hour" stroke="#4f46e5" dot={false} />
        <Line yAxisId="growth" type="monotone" dataKey="growthPercent" name="Growth %" stroke="#16a34a" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
