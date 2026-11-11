"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SnapshotPoint {
  collectedAt: string;
  viewCount: number;
}

export function VideoSnapshotChart({ data }: { data: SnapshotPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="collectedAt" tickFormatter={(value: string) => value.slice(5, 16)} />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="viewCount" stroke="#4f46e5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
