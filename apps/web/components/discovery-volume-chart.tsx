"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DiscoveryVolumePoint {
  day: string;
  count: number;
}

export function DiscoveryVolumeChart({ data }: { data: DiscoveryVolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="day" tickFormatter={(value: string) => value.slice(5, 10)} fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#2563eb" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
