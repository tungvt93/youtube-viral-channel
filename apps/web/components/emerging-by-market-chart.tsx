"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface EmergingByMarketPoint {
  marketCode: string;
  emergingVideoCount: number;
}

export function EmergingByMarketChart({ data }: { data: EmergingByMarketPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="marketCode" fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip />
        <Bar dataKey="emergingVideoCount" fill="#2563eb" />
      </BarChart>
    </ResponsiveContainer>
  );
}
