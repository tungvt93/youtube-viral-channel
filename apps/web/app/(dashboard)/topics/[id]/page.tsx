import { fetchApiOr404 } from "../../../../lib/fetch-or-404";
import { Card } from "../../../../components/card";
import { TopicTrendChart } from "../topic-trend-chart";
import styles from "./detail.module.css";

interface TrendSnapshotDto {
  id: string;
  marketId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  uniqueVideoCount: number;
  uniqueChannelCount: number;
  totalObservedViews: string | null;
  medianVph: number;
  p90Vph: number;
  outlierVideoCount: number;
  momentumScore: number;
  sampleConfidence: number;
  scoreBreakdown: unknown;
  lifecycleState: string;
}

export default async function TopicDetailPage({ params }: { params: { id: string } }) {
  const snapshots = await fetchApiOr404<TrendSnapshotDto[]>(`/topics/${params.id}/trends`);
  const latest = snapshots[0] ?? null;
  const chartData = [...snapshots].reverse().map((snapshot) => ({
    windowEnd: snapshot.windowEnd,
    momentumScore: snapshot.momentumScore,
  }));

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Topic {params.id}</h1>
        <p className={styles.subtitle}>
          {latest
            ? `${latest.lifecycleState} · sample confidence ${latest.sampleConfidence} · last window ending ${latest.windowEnd}`
            : "No trend snapshots yet."}
        </p>
      </div>

      <div className={styles.metrics}>
        <Card label="Momentum score" value={latest?.momentumScore ?? "—"} />
        <Card label="Unique videos" value={latest?.uniqueVideoCount ?? "—"} />
        <Card label="Unique channels" value={latest?.uniqueChannelCount ?? "—"} />
        <Card label="Outlier videos" value={latest?.outlierVideoCount ?? "—"} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Momentum over time</p>
        {chartData.length > 0 ? <TopicTrendChart data={chartData} /> : <p>No trend snapshots yet.</p>}
      </div>

      {latest?.scoreBreakdown != null ? (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Score breakdown</p>
          <pre>{JSON.stringify(latest.scoreBreakdown, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
