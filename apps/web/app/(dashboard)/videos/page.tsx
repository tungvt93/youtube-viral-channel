import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { WatchlistToggle } from "../../../components/watchlist-toggle";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./videos.module.css";
import { starVideo, unstarVideo } from "./actions";

/** `GET /videos`/`POST /videos/export` share these filter fields (plan Scope: export uses "same filters as `GET /videos`") — the Export CSV form below forwards the same values as hidden inputs. */
const FILTER_KEYS = ["marketId", "format", "lifecycle", "topicId", "channelTier", "minViews", "minScore", "watchlistedOnly"] as const;

/** `Video.formatClassification` values (packages/youtube-client's `FormatClassification`), duplicated here for the filter <select> the same way `CHANNEL_TIERS` is duplicated in the channels list page. */
const VIDEO_FORMATS = ["unknown", "short_candidate", "long"];

/** `Video.monitoringState` values (packages/shared's `MonitoringState`), same reasoning as `VIDEO_FORMATS`. */
const LIFECYCLE_STATES = ["candidate", "monitoring", "high_signal", "cooling", "archived", "unavailable"];

/** `Channel.channelTier` values, duplicated from the channels list page's `CHANNEL_TIERS`. */
const CHANNEL_TIERS = ["newcomer", "rising", "breakout", "established", "cooling"];

interface VideoListItemDto {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  marketCode: string | null;
  publishedAt: string;
  currentViewCount: string | null;
  monitoringState: string;
  latestViralScore: number | null;
  lastSnapshotAt: string | null;
  isWatchlisted: boolean;
}

interface VideoListResponseDto {
  items: VideoListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

interface VideosSearchParams {
  marketId?: string;
  format?: string;
  lifecycle?: string;
  topicId?: string;
  channelTier?: string;
  minViews?: string;
  minScore?: string;
  watchlistedOnly?: string;
  page?: string;
}

/** Matches `DEFAULT_LIMIT` in `apps/api/src/videos/videos.service.ts` — the page size this page requests. */
const PAGE_SIZE = 20;

/** Days since publish, for the PRD §13.3 "Age" column — derived from `publishedAt`, not a separate API field. */
function ageInDays(publishedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86_400_000));
}

export default async function VideosPage({ searchParams }: { searchParams: VideosSearchParams }) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const params = new URLSearchParams();
  if (searchParams.marketId) params.set("marketId", searchParams.marketId);
  if (searchParams.format) params.set("format", searchParams.format);
  if (searchParams.lifecycle) params.set("lifecycle", searchParams.lifecycle);
  if (searchParams.topicId) params.set("topicId", searchParams.topicId);
  if (searchParams.channelTier) params.set("channelTier", searchParams.channelTier);
  if (searchParams.minViews) params.set("minViews", searchParams.minViews);
  if (searchParams.minScore) params.set("minScore", searchParams.minScore);
  if (searchParams.watchlistedOnly) params.set("watchlistedOnly", searchParams.watchlistedOnly);
  const filterQuery = params.toString();

  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  const query = params.toString();

  const { items: videos, total } = await fetchApi<VideoListResponseDto>(`/videos?${query}`);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  /** Builds `/videos?<current filters>&page=<n>` — pagination links must carry the filter form's current values, not just the page number. */
  function pageHref(targetPage: number): string {
    const href = new URLSearchParams(filterQuery);
    href.set("page", String(targetPage));
    return `/videos?${href.toString()}`;
  }

  return (
    <div>
      <h1 className={styles.heading}>Viral Videos</h1>

      <form method="get" className={styles.filters}>
        <input type="text" name="marketId" placeholder="Market ID" defaultValue={searchParams.marketId ?? ""} />
        <select name="format" defaultValue={searchParams.format ?? ""}>
          <option value="">All formats</option>
          {VIDEO_FORMATS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select name="lifecycle" defaultValue={searchParams.lifecycle ?? ""}>
          <option value="">All lifecycle states</option>
          {LIFECYCLE_STATES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input type="text" name="topicId" placeholder="Topic ID" defaultValue={searchParams.topicId ?? ""} />
        <select name="channelTier" defaultValue={searchParams.channelTier ?? ""}>
          <option value="">All channel sizes</option>
          {CHANNEL_TIERS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input type="number" name="minViews" placeholder="Min views" defaultValue={searchParams.minViews ?? ""} />
        <input type="number" name="minScore" placeholder="Min score" defaultValue={searchParams.minScore ?? ""} />
        <label>
          <input type="checkbox" name="watchlistedOnly" value="true" defaultChecked={searchParams.watchlistedOnly === "true"} />
          Watchlist only
        </label>
        <button type="submit">Apply</button>
      </form>

      <form method="post" action="/api/videos/export" className={styles.filters}>
        {FILTER_KEYS.map((key) => (
          <input key={key} type="hidden" name={key} value={searchParams[key] ?? ""} />
        ))}
        <button type="submit">Export CSV</button>
      </form>

      <div className={styles.panel}>
        {videos.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Thumbnail</th>
                <th>Title</th>
                <th>Channel</th>
                <th>Market</th>
                <th>Published at</th>
                <th>Age</th>
                <th>Views</th>
                <th>Viral score</th>
                <th>Lifecycle</th>
                <th>Last snapshot</th>
                <th>Watchlist</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id}>
                  <td>
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className={styles.thumbnail} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Link href={`/videos/${video.id}`}>{video.title}</Link>
                  </td>
                  <td>{video.channelTitle ?? "—"}</td>
                  <td>{video.marketCode ?? "—"}</td>
                  <td>{video.publishedAt.slice(0, 10)}</td>
                  <td>{ageInDays(video.publishedAt)}d</td>
                  <td>{video.currentViewCount ?? "—"}</td>
                  <td>{video.latestViralScore ?? "—"}</td>
                  <td>{video.monitoringState}</td>
                  <td>{video.lastSnapshotAt ? video.lastSnapshotAt.slice(0, 10) : "—"}</td>
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
          <p className={tableStyles.empty}>No videos match this filter.</p>
        )}
      </div>

      {total > 0 ? (
        <div className={styles.pagination}>
          <span>
            Showing {offset + 1}–{Math.min(offset + videos.length, total)} of {total}
          </span>
          {currentPage > 1 ? <Link href={pageHref(currentPage - 1)}>Previous</Link> : <span>Previous</span>}
          <span>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? <Link href={pageHref(currentPage + 1)}>Next</Link> : <span>Next</span>}
        </div>
      ) : null}
    </div>
  );
}
