import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { WatchlistToggle } from "../../../components/watchlist-toggle";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./channels.module.css";
import { starChannel, unstarChannel } from "./actions";

/** `Channel.channelTier` enum values (packages/scoring's `ChannelTier`), duplicated here for the filter <select> the same way overview.ts duplicates `TopicLifecycleState` — this package has no dependency on @yvi/scoring. */
const CHANNEL_TIERS = ["newcomer", "rising", "breakout", "established", "cooling"];

interface ChannelListItemDto {
  id: string;
  title: string;
  channelTier: string;
  currentSubscriberCount: string | null;
  currentViewCount: string | null;
  latestChannelScore: number | null;
  isWatchlisted: boolean;
}

export default async function ChannelsPage({ searchParams }: { searchParams: { tier?: string; watchlistedOnly?: string } }) {
  const params = new URLSearchParams();
  if (searchParams.tier) params.set("tier", searchParams.tier);
  if (searchParams.watchlistedOnly) params.set("watchlistedOnly", searchParams.watchlistedOnly);
  const query = params.toString();
  const channels = await fetchApi<ChannelListItemDto[]>(`/channels${query ? `?${query}` : ""}`);

  return (
    <div>
      <h1 className={styles.heading}>Channel Discovery</h1>

      <form className={styles.filters} method="get">
        <label htmlFor="tier">Tier</label>
        <select id="tier" name="tier" defaultValue={searchParams.tier ?? ""}>
          <option value="">All tiers</option>
          {CHANNEL_TIERS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" name="watchlistedOnly" value="true" defaultChecked={searchParams.watchlistedOnly === "true"} />
          Watchlist only
        </label>
        <button type="submit">Apply</button>
      </form>

      <div className={styles.panel}>
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
          <p className={tableStyles.empty}>No channels match this filter.</p>
        )}
      </div>
    </div>
  );
}
