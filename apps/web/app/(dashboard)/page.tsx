import { fetchApi } from "../../lib/api";
import { Card, UnavailableCard } from "../../components/card";
import { DiscoveryVolumeChart } from "../../components/discovery-volume-chart";
import { EmergingByMarketChart } from "../../components/emerging-by-market-chart";
import tableStyles from "../../components/data-table.module.css";
import styles from "./overview.module.css";

interface OverviewSummaryDto {
  newVideosToday: number;
  emergingVideosCount: number;
  breakoutChannelsCount: number;
  risingTopicsCount: number;
  activeMarketsCount: number;
}

interface DiscoveryVolumeDto {
  byDay: { day: string; count: string }[];
  byMarket: { marketId: string; marketCode: string; emergingVideoCount: number }[];
}

interface TopEmergingVideoDto {
  id: string;
  title: string;
  channelTitle: string | null;
  latestViralScore: number | null;
}

interface TopRisingTopicDto {
  id: string;
  canonicalName: string;
  latestMomentumScore: number | null;
  latestLifecycleState: string | null;
}

interface TopBreakoutChannelDto {
  id: string;
  title: string;
  currentSubscriberCount: string | null;
}

interface TopSignalsDto {
  topEmergingVideos: TopEmergingVideoDto[];
  topRisingTopics: TopRisingTopicDto[];
  topBreakoutChannels: TopBreakoutChannelDto[];
}

export default async function OverviewPage() {
  const [summary, discoveryVolume, topSignals] = await Promise.all([
    fetchApi<OverviewSummaryDto>("/overview/summary"),
    fetchApi<DiscoveryVolumeDto>("/overview/discovery-volume"),
    fetchApi<TopSignalsDto>("/overview/top-signals"),
  ]);

  return (
    <div>
      <h1 className={styles.heading}>Overview</h1>

      <div className={styles.cards}>
        <Card label="New videos discovered today" value={summary.newVideosToday} />
        <Card label="Emerging videos" value={summary.emergingVideosCount} />
        <Card label="Breakout channels" value={summary.breakoutChannelsCount} />
        <Card label="Rising topics" value={summary.risingTopicsCount} />
        <Card label="Markets active" value={summary.activeMarketsCount} />
        <UnavailableCard label="API quota status" />
      </div>

      <div className={styles.charts}>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Video discoveries over time</p>
          {discoveryVolume.byDay.length > 0 ? (
            <DiscoveryVolumeChart data={discoveryVolume.byDay.map((point) => ({ day: point.day, count: Number(point.count) }))} />
          ) : (
            <p className={tableStyles.empty}>No discovery activity in this window yet.</p>
          )}
        </div>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Emerging videos by market</p>
          {discoveryVolume.byMarket.length > 0 ? (
            <EmergingByMarketChart data={discoveryVolume.byMarket} />
          ) : (
            <p className={tableStyles.empty}>No enabled markets yet.</p>
          )}
        </div>
      </div>

      <div className={styles.lists}>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Top emerging videos</p>
          {topSignals.topEmergingVideos.length > 0 ? (
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Channel</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {topSignals.topEmergingVideos.map((video) => (
                  <tr key={video.id}>
                    <td>{video.title}</td>
                    <td>{video.channelTitle ?? "—"}</td>
                    <td>{video.latestViralScore ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={tableStyles.empty}>No emerging videos yet.</p>
          )}
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>Top breakout channels</p>
          {topSignals.topBreakoutChannels.length > 0 ? (
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Subscribers</th>
                </tr>
              </thead>
              <tbody>
                {topSignals.topBreakoutChannels.map((channel) => (
                  <tr key={channel.id}>
                    <td>{channel.title}</td>
                    <td>{channel.currentSubscriberCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={tableStyles.empty}>No breakout channels yet.</p>
          )}
        </div>

        <div className={styles.panel}>
          <p className={styles.panelTitle}>Top rising topics</p>
          {topSignals.topRisingTopics.length > 0 ? (
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Momentum</th>
                  <th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {topSignals.topRisingTopics.map((topic) => (
                  <tr key={topic.id}>
                    <td>{topic.canonicalName}</td>
                    <td>{topic.latestMomentumScore ?? "—"}</td>
                    <td>{topic.latestLifecycleState ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={tableStyles.empty}>No rising topics yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
