import Link from "next/link";
import { fetchApi } from "../../../../lib/api";
import { fetchApiOr404 } from "../../../../lib/fetch-or-404";
import { Card } from "../../../../components/card";
import { WatchlistToggle } from "../../../../components/watchlist-toggle";
import { VideoSnapshotChart } from "./video-snapshot-chart";
import { VideoGrowthChart } from "./video-growth-chart";
import { starVideo, unstarVideo } from "../actions";
import styles from "./detail.module.css";

interface VideoDetailDto {
  id: string;
  youtubeVideoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  formatClassification: string;
  formatConfidence: number;
  monitoringState: string;
  currentViewCount: string | null;
  currentLikeCount: string | null;
  currentCommentCount: string | null;
  channel: { id: string; title: string; channelTier: string; currentSubscriberCount: string | null } | null;
  discoveryHistory: { discoveredAt: string; source: string; marketCode: string | null }[];
  topics: { id: string; canonicalName: string; relationType: string; confidence: number }[];
  isWatchlisted: boolean;
}

interface VideoSnapshotDto {
  collectedAt: string;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  fetchStatus: string;
  source: string;
}

interface VideoScoreDto {
  computedAt: string;
  viralScore: number;
  scoreBreakdown: unknown;
  dataConfidence: number;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** PRD §8.1B/§8.1C formulas, duplicated from packages/scoring's `computeVph`/`computeGrowthPct` — apps/web has no dependency on @yvi/scoring (it only ever talks to apps/api's JSON), so these two one-line formulas are inlined rather than adding a workspace dependency for them. */
function buildGrowthSeries(snapshots: VideoSnapshotDto[]): { collectedAt: string; vph: number; growthPercent: number }[] {
  const valid = snapshots
    .filter((snapshot) => snapshot.fetchStatus === "ok" && snapshot.viewCount !== null)
    .map((snapshot) => ({ collectedAt: snapshot.collectedAt, viewCount: Number(snapshot.viewCount) }))
    .reverse();

  const series: { collectedAt: string; vph: number; growthPercent: number }[] = [];
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const curr = valid[i];
    const hours = (new Date(curr.collectedAt).getTime() - new Date(prev.collectedAt).getTime()) / MS_PER_HOUR;
    const delta = curr.viewCount - prev.viewCount;
    series.push({
      collectedAt: curr.collectedAt,
      vph: hours > 0 ? delta / hours : 0,
      growthPercent: (delta / Math.max(prev.viewCount, 1)) * 100,
    });
  }
  return series;
}

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const video = await fetchApiOr404<VideoDetailDto>(`/videos/${params.id}`);
  const [snapshots, scores] = await Promise.all([
    fetchApi<VideoSnapshotDto[]>(`/videos/${params.id}/snapshots`),
    fetchApi<VideoScoreDto[]>(`/videos/${params.id}/scores`),
  ]);

  const latestScore = scores[0] ?? null;
  const snapshotChartData = [...snapshots]
    .reverse()
    .filter((snapshot) => snapshot.viewCount !== null)
    .map((snapshot) => ({ collectedAt: snapshot.collectedAt, viewCount: Number(snapshot.viewCount) }));
  const growthChartData = buildGrowthSeries(snapshots);

  return (
    <div>
      <div className={styles.header}>
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className={styles.thumbnail} /> : null}
        <h1 className={styles.title}>
          {video.title}{" "}
          <WatchlistToggle isWatchlisted={video.isWatchlisted} starAction={starVideo.bind(null, video.id)} unstarAction={unstarVideo.bind(null, video.id)} />
        </h1>
        <p className={styles.subtitle}>
          youtube.com/watch?v={video.youtubeVideoId} · published {video.publishedAt.slice(0, 10)} · {video.formatClassification} ·{" "}
          {video.monitoringState}
        </p>
      </div>

      <div className={styles.metrics}>
        <Card label="Views" value={video.currentViewCount ?? "—"} />
        <Card label="Likes" value={video.currentLikeCount ?? "—"} />
        <Card label="Comments" value={video.currentCommentCount ?? "—"} />
        <Card label="Viral score" value={latestScore?.viralScore ?? "—"} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Views over time</p>
        {snapshotChartData.length > 0 ? <VideoSnapshotChart data={snapshotChartData} /> : <p>No snapshots yet.</p>}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Views/hour and growth %</p>
        {growthChartData.length > 0 ? (
          <VideoGrowthChart data={growthChartData} />
        ) : (
          <p>Not enough snapshots yet to compute VPH/growth.</p>
        )}
      </div>

      {latestScore?.scoreBreakdown != null ? (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>
            Score breakdown (confidence {latestScore.dataConfidence}) — computed {latestScore.computedAt}
          </p>
          <pre className={styles.breakdown}>{JSON.stringify(latestScore.scoreBreakdown, null, 2)}</pre>
        </div>
      ) : (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Score breakdown</p>
          <p>No score computed yet.</p>
        </div>
      )}

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Discovery history</p>
        {video.discoveryHistory.length > 0 ? (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Discovered at</th>
                <th>Source</th>
                <th>Market</th>
              </tr>
            </thead>
            <tbody>
              {video.discoveryHistory.map((event, index) => (
                <tr key={index}>
                  <td>{event.discoveredAt.slice(0, 10)}</td>
                  <td>{event.source}</td>
                  <td>{event.marketCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No discovery events recorded.</p>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Topic classification</p>
        {video.topics.length > 0 ? (
          <ul className={styles.topicList}>
            {video.topics.map((topic) => (
              <li key={topic.id} className={styles.topicChip}>
                {topic.canonicalName} ({topic.relationType}, confidence {topic.confidence})
              </li>
            ))}
          </ul>
        ) : (
          <p>No topic classification yet.</p>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Channel</p>
        {video.channel ? (
          <p>
            <Link href={`/channels/${video.channel.id}`}>{video.channel.title}</Link> · {video.channel.channelTier} ·{" "}
            {video.channel.currentSubscriberCount ?? "—"} subscribers
          </p>
        ) : (
          <p>Channel unavailable.</p>
        )}
      </div>
    </div>
  );
}
