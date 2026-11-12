import { Injectable, NotFoundException } from "@nestjs/common";
import {
  addToWatchlist,
  countVideos,
  getVideoById,
  getVideoDetail,
  isWatchlisted,
  listVideoScores,
  listVideoSnapshots,
  listVideos,
  prisma,
  removeFromWatchlist,
  type VideoListFilter,
  type VideoListRow,
} from "@yvi/db";

/** Snapshot history "roadmap task" (plan Scope), scoped to a Phase 6 detail-page chart's future needs. */
const MAX_SNAPSHOTS_RETURNED = 500;

/** Score history, same reasoning as `MAX_SNAPSHOTS_RETURNED` — one row per scoring tick a video was eligible for. */
const MAX_SCORES_RETURNED = 500;

/** Default/maximum page size for `GET /videos` — same reasoning as `MAX_LIMIT` in the channels/topics modules: a bound, not a tuned product decision. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** `POST /videos/export` row cap (plan Risks: an unbounded filter could return an enormous CSV) — a safety bound, not a tuned product number, same class as `MAX_SNAPSHOTS_RETURNED`. */
const MAX_EXPORT_ROWS = 5000;

export interface VideoListItemDto {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  marketId: string | null;
  marketCode: string | null;
  publishedAt: string;
  currentViewCount: string | null;
  formatClassification: string;
  monitoringState: string;
  latestViralScore: number | null;
  latestScoreComputedAt: string | null;
  lastSnapshotAt: string | null;
  isWatchlisted: boolean;
}

export interface VideoListDto {
  items: VideoListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface VideoDetailDto {
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

export interface VideoFilterQuery {
  marketId?: string;
  format?: string;
  lifecycle?: string;
  topicId?: string;
  discoveryQueryId?: string;
  keywordSearchId?: string;
  channelTier?: string;
  minViews?: string;
  minScore?: string;
  watchlistedOnly?: string;
}

/** Shared by `parseListQuery` and `parseExportFilter` — the filter fields are identical between `GET /videos` and `POST /videos/export` (plan Scope: export uses "same filters as `GET /videos`"); only the limit/offset policy differs. */
function parseFilterFields(query: VideoFilterQuery, userId: string | undefined): Omit<VideoListFilter, "limit" | "offset"> {
  const minViews = query.minViews !== undefined && query.minViews !== "" ? BigInt(query.minViews) : undefined;
  const minScore = query.minScore !== undefined && query.minScore !== "" ? Number(query.minScore) : undefined;
  return {
    marketId: query.marketId || undefined,
    format: query.format || undefined,
    lifecycle: query.lifecycle || undefined,
    topicId: query.topicId || undefined,
    discoveryQueryId: query.discoveryQueryId || undefined,
    keywordSearchId: query.keywordSearchId || undefined,
    channelTier: query.channelTier || undefined,
    minViews,
    minScore: minScore !== undefined && Number.isFinite(minScore) ? minScore : undefined,
    watchlistedOnly: query.watchlistedOnly === "true",
    userId,
  };
}

/** Mirrors `parseListQuery` in the channels/topics modules: bound-clamp pagination, pass filters through untouched. */
export function parseListQuery(query: VideoFilterQuery, limit: string | undefined, offset: string | undefined, userId?: string): VideoListFilter {
  const parsedLimit = limit !== undefined ? Number(limit) : DEFAULT_LIMIT;
  const parsedOffset = offset !== undefined ? Number(offset) : 0;
  return {
    ...parseFilterFields(query, userId),
    limit: Math.min(Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

/** `POST /videos/export` (plan Scope) — same filters as `GET /videos`, no client-controlled limit/offset; fetches one row past `MAX_EXPORT_ROWS` so the caller can detect truncation without a second count query. */
function parseExportFilter(query: VideoFilterQuery, userId: string | undefined): VideoListFilter {
  return { ...parseFilterFields(query, userId), limit: MAX_EXPORT_ROWS + 1, offset: 0 };
}

export interface VideoSnapshotDto {
  collectedAt: string;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  fetchStatus: string;
  source: string;
}

export interface VideoScoreDto {
  computedAt: string;
  viralScore: number;
  scoreBreakdown: unknown;
  dataConfidence: number;
}

/** Counts come back from `listVideos`/`getVideoDetail` as `bigint`, `number`, or a numeric string depending on the driver — stringified uniformly, same reasoning as `countToString` in the channels module. */
function countToString(value: bigint | number | string | null): string | null {
  return value === null ? null : value.toString();
}

/** `Decimal` columns (`viral_score`, `format_confidence`, `video_topics.confidence`) come back as `Prisma.Decimal` instances from the model API, or plain numbers/strings from raw SQL (`listVideos`) — `Number()` coerces either via `Decimal`'s `valueOf`. */
function toNumberOrNull(value: number | string | { valueOf(): string } | null): number | null {
  return value === null ? null : Number(value);
}

function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Counts are BIGINT and serialized as strings rather than numbers — a view
 * count can exceed `Number.MAX_SAFE_INTEGER`, and `JSON.stringify` throws on
 * a raw `bigint` outright. `viralScore`/`dataConfidence` are Prisma
 * `Decimal`s (6,2 and 5,4 respectively) — well within safe-number range, so
 * `.toNumber()` loses nothing and keeps the DTO JSON-plain.
 */
const WATCHLIST_ENTITY_TYPE = "video";

function toVideoListItemDto(row: VideoListRow): VideoListItemDto {
  return {
    id: row.id,
    youtubeVideoId: row.youtubeVideoId,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl,
    channelId: row.channelId,
    channelTitle: row.channelTitle,
    marketId: row.marketId,
    marketCode: row.marketCode,
    publishedAt: toIsoOrNull(row.publishedAt) as string,
    currentViewCount: countToString(row.currentViewCount),
    formatClassification: row.formatClassification,
    monitoringState: row.monitoringState,
    latestViralScore: toNumberOrNull(row.latestViralScore),
    latestScoreComputedAt: toIsoOrNull(row.latestScoreComputedAt),
    lastSnapshotAt: toIsoOrNull(row.lastSnapshotAt),
    isWatchlisted: row.isWatchlisted,
  };
}

/** `POST /videos/export` CSV columns — the same fields `GET /videos` lists, in a stable column order. */
const EXPORT_COLUMNS: { header: string; value: (row: VideoListItemDto) => string }[] = [
  { header: "youtube_video_id", value: (row) => row.youtubeVideoId },
  { header: "title", value: (row) => row.title },
  { header: "channel_title", value: (row) => row.channelTitle ?? "" },
  { header: "market_code", value: (row) => row.marketCode ?? "" },
  { header: "published_at", value: (row) => row.publishedAt },
  { header: "current_view_count", value: (row) => row.currentViewCount ?? "" },
  { header: "format_classification", value: (row) => row.formatClassification },
  { header: "monitoring_state", value: (row) => row.monitoringState },
  { header: "latest_viral_score", value: (row) => (row.latestViralScore !== null ? String(row.latestViralScore) : "") },
  { header: "last_snapshot_at", value: (row) => row.lastSnapshotAt ?? "" },
];

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: VideoListItemDto[]): string {
  const lines = [EXPORT_COLUMNS.map((column) => column.header).join(",")];
  for (const row of rows) {
    lines.push(EXPORT_COLUMNS.map((column) => csvEscape(column.value(row))).join(","));
  }
  return lines.join("\r\n");
}

@Injectable()
export class VideosService {
  async list(query: VideoFilterQuery, limit: string | undefined, offset: string | undefined, userId?: string): Promise<VideoListDto> {
    const filter = parseListQuery(query, limit, offset, userId);
    const { limit: filterLimit, offset: filterOffset, ...countFilter } = filter;
    const [rows, total] = await Promise.all([listVideos(prisma, filter), countVideos(prisma, countFilter)]);
    return { items: rows.map(toVideoListItemDto), total, limit: filterLimit, offset: filterOffset };
  }

  /** `POST /videos/export` (PRD §16.3, FR-VID-10) — same filters as `GET /videos`, row-capped at `MAX_EXPORT_ROWS`; `truncated` tells the caller whether the filtered set exceeded the cap (plan Risks: never silently drop rows with no indication). */
  async exportCsv(query: VideoFilterQuery, userId?: string): Promise<{ csv: string; truncated: boolean }> {
    const filter = parseExportFilter(query, userId);
    const rows = await listVideos(prisma, filter);
    const truncated = rows.length > MAX_EXPORT_ROWS;
    const dtoRows = (truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows).map(toVideoListItemDto);
    return { csv: toCsv(dtoRows), truncated };
  }

  async detail(videoId: string, userId?: string): Promise<VideoDetailDto> {
    const row = await getVideoDetail(prisma, videoId);
    if (!row) {
      throw new NotFoundException(`video ${videoId} not found`);
    }
    const watchlisted = userId
      ? await isWatchlisted(prisma, { userId, entityType: WATCHLIST_ENTITY_TYPE, entityId: videoId })
      : false;
    return {
      id: row.id,
      youtubeVideoId: row.youtubeVideoId,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnailUrl,
      publishedAt: toIsoOrNull(row.publishedAt) as string,
      durationSeconds: row.durationSeconds,
      formatClassification: row.formatClassification,
      formatConfidence: toNumberOrNull(row.formatConfidence) as number,
      monitoringState: row.monitoringState,
      currentViewCount: countToString(row.currentViewCount),
      currentLikeCount: countToString(row.currentLikeCount),
      currentCommentCount: countToString(row.currentCommentCount),
      channel: row.channel
        ? {
            id: row.channel.id,
            title: row.channel.title,
            channelTier: row.channel.channelTier,
            currentSubscriberCount: countToString(row.channel.currentSubscriberCount),
          }
        : null,
      discoveryHistory: row.discoveryEvents.map((event) => ({
        discoveredAt: toIsoOrNull(event.discoveredAt) as string,
        source: event.source,
        marketCode: event.market?.code ?? null,
      })),
      topics: row.videoTopics.map((videoTopic) => ({
        id: videoTopic.topic.id,
        canonicalName: videoTopic.topic.canonicalName,
        relationType: videoTopic.relationType,
        confidence: toNumberOrNull(videoTopic.confidence) as number,
      })),
      isWatchlisted: watchlisted,
    };
  }

  /** `POST /videos/:id/watchlist` (PRD §16.3, FR-VID-08) — idempotent star. */
  async star(videoId: string, userId: string): Promise<void> {
    const video = await getVideoById(prisma, videoId);
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }
    await addToWatchlist(prisma, { userId, entityType: WATCHLIST_ENTITY_TYPE, entityId: videoId });
  }

  /** `DELETE /videos/:id/watchlist` — idempotent unstar. */
  async unstar(videoId: string, userId: string): Promise<void> {
    await removeFromWatchlist(prisma, { userId, entityType: WATCHLIST_ENTITY_TYPE, entityId: videoId });
  }

  async getSnapshots(videoId: string): Promise<VideoSnapshotDto[]> {
    const video = await getVideoById(prisma, videoId);
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const snapshots = await listVideoSnapshots(prisma, videoId, MAX_SNAPSHOTS_RETURNED);
    return snapshots.map((snapshot) => ({
      collectedAt: snapshot.collectedAt.toISOString(),
      viewCount: snapshot.viewCount !== null ? snapshot.viewCount.toString() : null,
      likeCount: snapshot.likeCount !== null ? snapshot.likeCount.toString() : null,
      commentCount: snapshot.commentCount !== null ? snapshot.commentCount.toString() : null,
      fetchStatus: snapshot.fetchStatus,
      source: snapshot.source,
    }));
  }

  async getScores(videoId: string): Promise<VideoScoreDto[]> {
    const video = await getVideoById(prisma, videoId);
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const scores = await listVideoScores(prisma, videoId, MAX_SCORES_RETURNED);
    return scores.map((score) => ({
      computedAt: score.computedAt.toISOString(),
      viralScore: score.viralScore.toNumber(),
      scoreBreakdown: score.scoreBreakdown,
      dataConfidence: score.dataConfidence.toNumber(),
    }));
  }
}
