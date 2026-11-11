"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendPoint {
  windowEnd: string;
  momentumScore: number;
}

export function TopicTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="windowEnd" tickFormatter={(value: string) => value.slice(5, 10)} />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="momentumScore" stroke="#4f46e5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
