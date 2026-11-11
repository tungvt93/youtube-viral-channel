import { fetchApiOr404 } from "../../../../lib/fetch-or-404";
import { Card } from "../../../../components/card";
import { WatchlistToggle } from "../../../../components/watchlist-toggle";
import { starChannel, unstarChannel } from "../actions";
import styles from "./detail.module.css";

interface ChannelDetailDto {
  id: string;
  youtubeChannelId: string;
  title: string;
  description: string;
  channelTier: string;
  currentSubscriberCount: string | null;
  currentViewCount: string | null;
  currentVideoCount: string | null;
  latestChannelScore: number | null;
  latestScoreBreakdown: unknown;
  latestScoreDataConfidence: number | null;
  latestScoreComputedAt: string | null;
  isWatchlisted: boolean;
}

export default async function ChannelDetailPage({ params }: { params: { id: string } }) {
  const channel = await fetchApiOr404<ChannelDetailDto>(`/channels/${params.id}`);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {channel.title}{" "}
          <WatchlistToggle
            isWatchlisted={channel.isWatchlisted}
            starAction={starChannel.bind(null, channel.id)}
            unstarAction={unstarChannel.bind(null, channel.id)}
          />
        </h1>
        <p className={styles.subtitle}>
          {channel.channelTier} · youtube.com/channel/{channel.youtubeChannelId}
        </p>
      </div>

      <div className={styles.metrics}>
        <Card label="Subscribers" value={channel.currentSubscriberCount ?? "—"} />
        <Card label="Total views" value={channel.currentViewCount ?? "—"} />
        <Card label="Videos" value={channel.currentVideoCount ?? "—"} />
        <Card label="Channel score" value={channel.latestChannelScore ?? "—"} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Description</p>
        <p>{channel.description || "No description."}</p>
      </div>

      {channel.latestScoreBreakdown != null ? (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>
            Score breakdown{channel.latestScoreDataConfidence !== null ? ` (confidence ${channel.latestScoreDataConfidence})` : ""}
            {channel.latestScoreComputedAt ? ` — computed ${channel.latestScoreComputedAt}` : ""}
          </p>
          <pre className={styles.breakdown}>{JSON.stringify(channel.latestScoreBreakdown, null, 2)}</pre>
        </div>
      ) : (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Score breakdown</p>
          <p>No score computed yet.</p>
        </div>
      )}
    </div>
  );
}
