import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { WatchlistToggle } from "../../../components/watchlist-toggle";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./watchlist.module.css";
import { starVideo, unstarVideo } from "../videos/actions";
import { starChannel, unstarChannel } from "../channels/actions";

interface WatchlistedVideoDto {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  marketCode: string | null;
  publishedAt: string;
  currentViewCount: string | null;
  monitoringState: string;
  latestViralScore: number | null;
  isWatchlisted: boolean;
}

interface WatchlistedChannelDto {
  id: string;
  title: string;
  channelTier: string;
  currentSubscriberCount: string | null;
  currentViewCount: string | null;
  latestChannelScore: number | null;
  isWatchlisted: boolean;
}

/** Watchlist page (PRD FR-VID-08/FR-CH-06) — a combined view of `GET /videos?watchlistedOnly=true` and `GET /channels?watchlistedOnly=true`, reusing the same star/unstar Server Actions as the videos/channels list pages. */
export default async function WatchlistPage() {
  const [videos, channels] = await Promise.all([
    fetchApi<WatchlistedVideoDto[]>("/videos?watchlistedOnly=true"),
    fetchApi<WatchlistedChannelDto[]>("/channels?watchlistedOnly=true"),
  ]);

  return (
    <div>
      <h1 className={styles.heading}>Watchlist</h1>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Videos</p>
        {videos.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Channel</th>
                <th>Market</th>
                <th>Views</th>
                <th>Viral score</th>
                <th>Lifecycle</th>
                <th>Watchlist</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id}>
                  <td>
                    <Link href={`/videos/${video.id}`}>{video.title}</Link>
                  </td>
                  <td>{video.channelTitle ?? "—"}</td>
                  <td>{video.marketCode ?? "—"}</td>
                  <td>{video.currentViewCount ?? "—"}</td>
                  <td>{video.latestViralScore ?? "—"}</td>
                  <td>{video.monitoringState}</td>
                  <td>
                    <WatchlistToggle
                      isWatchlisted={video.isWatchlisted}
                      starAction={starVideo.bind(null, video.id)}
                      unstarAction={unstarVideo.bind(null, video.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No videos on the watchlist.</p>
        )}
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Channels</p>
        {channels.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Tier</th>
                <th>Subscribers</th>
                <th>Views</th>
                <th>Score</th>
                <th>Watchlist</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id}>
                  <td>
                    <Link href={`/channels/${channel.id}`}>{channel.title}</Link>
                  </td>
                  <td>{channel.channelTier}</td>
                  <td>{channel.currentSubscriberCount ?? "—"}</td>
                  <td>{channel.currentViewCount ?? "—"}</td>
                  <td>{channel.latestChannelScore ?? "—"}</td>
                  <td>
                    <WatchlistToggle
                      isWatchlisted={channel.isWatchlisted}
                      starAction={starChannel.bind(null, channel.id)}
                      unstarAction={unstarChannel.bind(null, channel.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No channels on the watchlist.</p>
        )}
      </div>
    </div>
  );
}
