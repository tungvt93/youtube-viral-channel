import type { PrismaClient, Video } from "../../generated/client";

export interface VideoUpsertInput {
  youtubeVideoId: string;
  channelId: string | null;
  title: string;
  description: string;
  publishedAt: Date;
  durationSeconds: number | null;
  categoryId: string;
  defaultLanguage: string | null;
  thumbnailUrl: string | null;
  currentViewCount: bigint | null;
  currentLikeCount: bigint | null;
  currentCommentCount: bigint | null;
  videoLicense: string | null;
  privacyStatus: string | null;
  embeddable: boolean | null;
  liveBroadcastContent: string | null;
  formatClassification: string;
  formatConfidence: number;
  tags: string[];
}

/**
 * Upserts a video by its unique `youtube_video_id`, deduplicating discovery
 * across markets/strategies (PRD §6.6, §15.3). Only called from the
 * video-enrichment processor, which is the sole place with the full
 * `videos.list` metadata (including the NOT NULL `category_id`).
 */
export function upsertVideo(db: PrismaClient, input: VideoUpsertInput): Promise<Video> {
  const data = {
    channelId: input.channelId,
    title: input.title,
    description: input.description,
    publishedAt: input.publishedAt,
    durationSeconds: input.durationSeconds,
    categoryId: input.categoryId,
    defaultLanguage: input.defaultLanguage,
    thumbnailUrl: input.thumbnailUrl,
    currentViewCount: input.currentViewCount,
    currentLikeCount: input.currentLikeCount,
    currentCommentCount: input.currentCommentCount,
    videoLicense: input.videoLicense,
    privacyStatus: input.privacyStatus,
    embeddable: input.embeddable,
    liveBroadcastContent: input.liveBroadcastContent,
    formatClassification: input.formatClassification,
    formatConfidence: input.formatConfidence,
    tags: input.tags,
    lastEnrichedAt: new Date(),
  };
  return db.video.upsert({
    where: { youtubeVideoId: input.youtubeVideoId },
    create: { youtubeVideoId: input.youtubeVideoId, ...data },
    update: data,
  });
}

export function getVideoByYoutubeId(db: PrismaClient, youtubeVideoId: string): Promise<Video | null> {
  return db.video.findUnique({ where: { youtubeVideoId } });
}

export function getVideoById(db: PrismaClient, id: string): Promise<Video | null> {
  return db.video.findUnique({ where: { id } });
}

/**
 * Which of the given YouTube video ids are already known, as a single
 * batched query (not one `getVideoByYoutubeId` call per id) — used by
 * channel-video-discovery to skip re-enriching uploads-playlist items the
 * system has already seen on a prior poll (PRD §9.5).
 */
export async function listKnownYoutubeVideoIds(db: PrismaClient, youtubeVideoIds: string[]): Promise<Set<string>> {
  if (youtubeVideoIds.length === 0) {
    return new Set();
  }
  const rows = await db.video.findMany({
    where: { youtubeVideoId: { in: youtubeVideoIds } },
    select: { youtubeVideoId: true },
  });
  return new Set(rows.map((row) => row.youtubeVideoId));
}

export interface DueSnapshotVideo {
  id: string;
  youtubeVideoId: string;
  publishedAt: Date;
  monitoringState: string;
  lastSnapshotAt: Date | null;
}

/**
 * Videos eligible for a monitoring snapshot (PRD §7.2/§7.3): never
 * `unavailable` (the API no longer returns it, so polling again just burns
 * quota) and past their adaptive `next_snapshot_due_at`. Ordered oldest-due
 * first so the longest-overdue videos are served first when a tick's
 * `limit` is smaller than the full due set.
 */
export function listVideosDueForSnapshot(db: PrismaClient, now: Date, limit: number): Promise<DueSnapshotVideo[]> {
  return db.video.findMany({
    where: { monitoringState: { not: "unavailable" }, nextSnapshotDueAt: { lte: now } },
    orderBy: { nextSnapshotDueAt: "asc" },
    take: limit,
    select: { id: true, youtubeVideoId: true, publishedAt: true, monitoringState: true, lastSnapshotAt: true },
  });
}

export interface UpdateVideoMonitoringStateInput {
  monitoringState: string;
  lastSnapshotAt: Date | null;
  nextSnapshotDueAt: Date;
}

export function updateVideoMonitoringState(
  db: PrismaClient,
  videoId: string,
  input: UpdateVideoMonitoringStateInput,
): Promise<Video> {
  return db.video.update({
    where: { id: videoId },
    data: {
      monitoringState: input.monitoringState,
      lastSnapshotAt: input.lastSnapshotAt,
      nextSnapshotDueAt: input.nextSnapshotDueAt,
    },
  });
}

export interface ScoringEligibleVideo {
  id: string;
  title: string;
  channelId: string | null;
  publishedAt: Date;
  monitoringState: string;
  lastSnapshotAt: Date | null;
  formatClassification: string;
  currentViewCount: bigint | null;
  channelSubscriberCount: bigint | null;
}

/**
 * Candidate pool for a scoring tick (PRD §8): never `candidate`/
 * `unavailable`/`archived` — those states are outside Phase 3's scoring
 * ownership (see plan Scope/Decisions). Whether each video actually has
 * enough valid snapshots to be scored is checked afterward from
 * `listRecentValidSnapshots`, not here, to avoid a relation-count filter.
 */
export function listVideosEligibleForScoring(db: PrismaClient, limit: number): Promise<ScoringEligibleVideo[]> {
  return db.video
    .findMany({
      where: { monitoringState: { in: ["monitoring", "high_signal", "cooling"] } },
      orderBy: { lastSnapshotAt: "asc" },
      take: limit,
      select: {
        id: true,
        title: true,
        channelId: true,
        publishedAt: true,
        monitoringState: true,
        lastSnapshotAt: true,
        formatClassification: true,
        currentViewCount: true,
        channel: { select: { currentSubscriberCount: true } },
      },
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        channelId: row.channelId,
        publishedAt: row.publishedAt,
        monitoringState: row.monitoringState,
        lastSnapshotAt: row.lastSnapshotAt,
        formatClassification: row.formatClassification,
        currentViewCount: row.currentViewCount,
        channelSubscriberCount: row.channel?.currentSubscriberCount ?? null,
      })),
    );
}

export interface ClassificationEligibleVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  channelTitle: string;
  channelDescription: string;
}

/**
 * Candidate pool for a video-classification tick (PRD §10/§19.3): videos
 * with zero successful `ai_classification_runs` row yet. First cut only —
 * re-classification after a video's metadata changes is explicitly out of
 * scope for this phase (see plan "Out of scope"), so a video with any
 * `status = "success"` run is permanently skipped here, not re-queued.
 * Ordered oldest-discovered-first so the backlog drains in FIFO order.
 */
export function listVideosEligibleForClassification(
  db: PrismaClient,
  limit: number,
): Promise<ClassificationEligibleVideo[]> {
  return db.video
    .findMany({
      where: { aiClassificationRuns: { none: { status: "success" } } },
      orderBy: { firstDiscoveredAt: "asc" },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        categoryId: true,
        channel: { select: { title: true, description: true } },
      },
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        tags: row.tags,
        categoryId: row.categoryId,
        channelTitle: row.channel?.title ?? "",
        channelDescription: row.channel?.description ?? "",
      })),
    );
}

/** Applies a successful AI classification's `format`/`confidence` onto the video row (PRD §10: AI classification supersedes the heuristic `classifyFormat` guess once available). */
export function updateVideoClassification(
  db: PrismaClient,
  videoId: string,
  formatClassification: string,
  formatConfidence: number,
): Promise<Video> {
  return db.video.update({
    where: { id: videoId },
    data: { formatClassification, formatConfidence },
  });
}

export interface ChannelPeerView {
  videoId: string;
  currentViewCount: bigint;
}

/**
 * Up to `limit` of a channel's most-recent videos with a known view count,
 * for the PRD §8.1E channel-outlier median baseline. One query per distinct
 * `channelId` (not per video) — a scoring tick caches this by `channelId`
 * and excludes the video being scored in memory, so multiple eligible
 * videos from the same channel share one query instead of N+1.
 */
export function listChannelPeerViews(db: PrismaClient, channelId: string, limit: number): Promise<ChannelPeerView[]> {
  return db.video
    .findMany({
      where: { channelId, currentViewCount: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: { id: true, currentViewCount: true },
    })
    .then((rows) => rows.map((row) => ({ videoId: row.id, currentViewCount: row.currentViewCount as bigint })));
}

export interface RecommendedScrapeSeed {
  videoId: string;
  youtubeVideoId: string;
  gl: string;
  hl: string;
  rootSeedVideoId: string;
}

/**
 * Candidate pool for a recommended-scrape tick: `high_signal`/`cooling`
 * videos never yet scraped for recommendations, oldest-discovered first.
 * Each seed's `gl`/`hl` (the YouTube `videos.list` region/language params to
 * scrape it with) and `rootSeedVideoId` (for scrape-depth bookkeeping) are
 * resolved from its earliest `DiscoveryEvent`: a first-generation seed takes
 * `gl`/`hl` from that event's `Market` and is its own root; a seed that was
 * itself discovered via a prior recommended-scrape instead reuses the
 * lineage recorded verbatim on that event's `sourcePayload` (the shape Task
 * 6's `recommended-scrape.ts` writes as `ScrapeLineage`). A seed whose
 * earliest event has no resolvable market, or whose recommended_scrape
 * origin's `sourcePayload` is missing/malformed, is marked scraped (not
 * returned) so it doesn't permanently dominate the oldest-unscraped pool.
 */
export async function listRecommendedScrapeSeeds(
  db: PrismaClient,
  limit: number,
  now: Date,
): Promise<RecommendedScrapeSeed[]> {
  const rows = await db.video.findMany({
    where: { monitoringState: { in: ["high_signal", "cooling"] }, recommendedScrapedAt: null },
    orderBy: { firstDiscoveredAt: "asc" },
    take: limit,
    select: {
      id: true,
      youtubeVideoId: true,
      discoveryEvents: {
        orderBy: { discoveredAt: "asc" },
        take: 1,
        select: { source: true, sourcePayload: true, market: { select: { code: true, defaultLanguage: true } } },
      },
    },
  });

  const seeds: RecommendedScrapeSeed[] = [];
  const unresolvedIds: string[] = [];
  for (const row of rows) {
    const earliestEvent = row.discoveryEvents[0];
    if (!earliestEvent) {
      unresolvedIds.push(row.id);
      continue;
    }

    if (earliestEvent.source === "recommended_scrape") {
      const lineage = earliestEvent.sourcePayload as { gl?: unknown; hl?: unknown; rootSeedVideoId?: unknown } | null;
      const { gl, hl, rootSeedVideoId } = lineage ?? {};
      if (typeof gl !== "string" || typeof hl !== "string" || typeof rootSeedVideoId !== "string") {
        unresolvedIds.push(row.id);
        continue;
      }
      seeds.push({ videoId: row.id, youtubeVideoId: row.youtubeVideoId, gl, hl, rootSeedVideoId });
      continue;
    }

    if (!earliestEvent.market) {
      unresolvedIds.push(row.id);
      continue;
    }
    seeds.push({
      videoId: row.id,
      youtubeVideoId: row.youtubeVideoId,
      gl: earliestEvent.market.code,
      hl: earliestEvent.market.defaultLanguage,
      rootSeedVideoId: row.id,
    });
  }

  if (unresolvedIds.length > 0) {
    await db.video.updateMany({ where: { id: { in: unresolvedIds } }, data: { recommendedScrapedAt: now } });
  }

  return seeds;
}

/** Records that a seed's recommendations have been scraped (PRD's recommended-scrape worker), so it isn't re-selected by `listRecommendedScrapeSeeds`. */
export async function markVideoRecommendedScraped(db: PrismaClient, videoId: string, scrapedAt: Date): Promise<void> {
  await db.video.update({ where: { id: videoId }, data: { recommendedScrapedAt: scrapedAt } });
}

/**
 * Which of the given YouTube video ids already have an internal video row,
 * mapped `youtubeVideoId -> id` — used by the recommended-scrape worker to
 * tell already-known recommended videos from ones needing enrichment,
 * without one `getVideoByYoutubeId` call per id.
 */
export async function getVideoIdsByYoutubeIds(db: PrismaClient, youtubeVideoIds: string[]): Promise<Map<string, string>> {
  if (youtubeVideoIds.length === 0) {
    return new Map();
  }
  const rows = await db.video.findMany({
    where: { youtubeVideoId: { in: youtubeVideoIds } },
    select: { id: true, youtubeVideoId: true },
  });
  return new Map(rows.map((row) => [row.youtubeVideoId, row.id]));
}

export interface VideoListFilter {
  marketId?: string;
  format?: string;
  lifecycle?: string;
  topicId?: string;
  /** Restrict to videos found by this exact `discovery_queries.id` (PRD §16.3 "filter by discovery source") — mirrors `topicId`'s EXISTS shape against `discovery_events` instead of `video_topics`. */
  discoveryQueryId?: string;
  channelTier?: string;
  minViews?: bigint;
  minScore?: number;
  /** Restrict to videos on `userId`'s watchlist (PRD §16.3) — has no effect unless `userId` is also given. */
  watchlistedOnly?: boolean;
  /** Current user id, used both to compute `isWatchlisted` per row and (with `watchlistedOnly`) to filter. */
  userId?: string;
  limit: number;
  offset: number;
}

export interface VideoListRow {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  marketId: string | null;
  marketCode: string | null;
  publishedAt: Date;
  currentViewCount: bigint | null;
  formatClassification: string;
  monitoringState: string;
  latestViralScore: number | string | null;
  latestScoreComputedAt: Date | null;
  lastSnapshotAt: Date | null;
  isWatchlisted: boolean;
}

/**
 * `GET /videos` backing query (PRD §13.3): latest `VideoScore`/`VideoSnapshot`
 * per video and the video's earliest `DiscoveryEvent` market (a video can be
 * discovered via more than one market/query over time — the schema has no
 * single owning-market column on `Video` itself, so the first discovery is
 * used as the representative "market discovered" column), all via `LATERAL`
 * joins — same one-round-trip discipline as `listChannels`. Only filters that
 * map directly onto an existing indexed/plain column are supported; VPH,
 * growth %, and outlier multiplier live inside `VideoScore.scoreBreakdown`
 * JSON and are not filterable/sortable here (see Phase 6a plan Decisions).
 *
 * `isWatchlisted` is computed via a correlated `EXISTS` against
 * `watchlist_items` bound to `filter.userId`'s own `$n` parameter (never
 * string-interpolated) — with no `userId`, every row reports `false` rather
 * than running an unbounded/unowned watchlist check.
 */
function buildVideoFilterSql(filter: Omit<VideoListFilter, "limit" | "offset">, params: unknown[]): { whereClause: string; watchlistExistsSql: string | null } {
  const conditions: string[] = [];

  function addCondition(sql: string, value: unknown): void {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  }

  let watchlistUserIdParam: number | null = null;
  if (filter.userId) {
    params.push(filter.userId);
    watchlistUserIdParam = params.length;
  }
  const watchlistExistsSql = watchlistUserIdParam
    ? `EXISTS (SELECT 1 FROM watchlist_items wi WHERE wi.entity_type = 'video' AND wi.entity_id = v.id AND wi.user_id = $${watchlistUserIdParam})`
    : null;

  if (filter.marketId) addCondition("first_disc.market_id = ?", filter.marketId);
  if (filter.format) addCondition("v.format_classification = ?", filter.format);
  if (filter.lifecycle) addCondition("v.monitoring_state = ?", filter.lifecycle);
  if (filter.channelTier) addCondition("c.channel_tier = ?", filter.channelTier);
  if (filter.minViews !== undefined) addCondition("v.current_view_count >= ?", filter.minViews);
  if (filter.minScore !== undefined) addCondition("latest_score.viral_score >= ?", filter.minScore);
  if (filter.topicId) addCondition("EXISTS (SELECT 1 FROM video_topics vt WHERE vt.video_id = v.id AND vt.topic_id = ?)", filter.topicId);
  if (filter.discoveryQueryId) addCondition("EXISTS (SELECT 1 FROM discovery_events de WHERE de.video_id = v.id AND de.discovery_query_id = ?)", filter.discoveryQueryId);
  if (filter.watchlistedOnly && watchlistExistsSql) conditions.push(watchlistExistsSql);

  return { whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", watchlistExistsSql };
}

export async function listVideos(db: PrismaClient, filter: VideoListFilter): Promise<VideoListRow[]> {
  const params: unknown[] = [filter.limit, filter.offset];
  const { whereClause, watchlistExistsSql } = buildVideoFilterSql(filter, params);

  return db.$queryRawUnsafe<VideoListRow[]>(
    `
    SELECT
      v.id AS "id",
      v.youtube_video_id AS "youtubeVideoId",
      v.title AS "title",
      v.thumbnail_url AS "thumbnailUrl",
      v.channel_id AS "channelId",
      c.title AS "channelTitle",
      first_disc.market_id AS "marketId",
      m.code AS "marketCode",
      v.published_at AS "publishedAt",
      v.current_view_count AS "currentViewCount",
      v.format_classification AS "formatClassification",
      v.monitoring_state AS "monitoringState",
      latest_score.viral_score AS "latestViralScore",
      latest_score.computed_at AS "latestScoreComputedAt",
      latest_snap.collected_at AS "lastSnapshotAt",
      ${watchlistExistsSql ?? "false"} AS "isWatchlisted"
    FROM videos v
    LEFT JOIN channels c ON c.id = v.channel_id
    LEFT JOIN LATERAL (
      SELECT market_id FROM discovery_events WHERE video_id = v.id ORDER BY discovered_at ASC LIMIT 1
    ) first_disc ON true
    LEFT JOIN markets m ON m.id = first_disc.market_id
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (video_id) viral_score, computed_at
      FROM video_scores
      WHERE video_id = v.id
      ORDER BY video_id, computed_at DESC
    ) latest_score ON true
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (video_id) collected_at
      FROM video_snapshots
      WHERE video_id = v.id
      ORDER BY video_id, collected_at DESC
    ) latest_snap ON true
    ${whereClause}
    ORDER BY latest_score.viral_score DESC NULLS LAST, v.published_at DESC
    LIMIT $1 OFFSET $2
    `,
    ...params,
  );
}

/** `GET /videos` total-match count (same filter semantics as `listVideos`, no `LIMIT`/`OFFSET`) — lets the caller page without guessing when the last page is reached. */
export async function countVideos(db: PrismaClient, filter: Omit<VideoListFilter, "limit" | "offset">): Promise<number> {
  const params: unknown[] = [];
  const { whereClause } = buildVideoFilterSql(filter, params);

  const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `
    SELECT COUNT(*) AS "count"
    FROM videos v
    LEFT JOIN channels c ON c.id = v.channel_id
    LEFT JOIN LATERAL (
      SELECT market_id FROM discovery_events WHERE video_id = v.id ORDER BY discovered_at ASC LIMIT 1
    ) first_disc ON true
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (video_id) viral_score
      FROM video_scores
      WHERE video_id = v.id
      ORDER BY video_id, computed_at DESC
    ) latest_score ON true
    ${whereClause}
    `,
    ...params,
  );
  return Number(rows[0]?.count ?? 0);
}

export interface VideoDetailRow {
  id: string;
  youtubeVideoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  durationSeconds: number | null;
  formatClassification: string;
  formatConfidence: { valueOf(): string };
  monitoringState: string;
  currentViewCount: bigint | null;
  currentLikeCount: bigint | null;
  currentCommentCount: bigint | null;
  channel: { id: string; title: string; channelTier: string; currentSubscriberCount: bigint | null } | null;
  discoveryEvents: { discoveredAt: Date; source: string; market: { code: string } | null }[];
  videoTopics: { relationType: string; confidence: { valueOf(): string }; topic: { id: string; canonicalName: string } }[];
}

const DETAIL_DISCOVERY_EVENTS_LIMIT = 20;

/** `GET /videos/:id` backing query (PRD §13.4 sections 1, 2, 6, 7, 9): plain Prisma relations, no raw SQL needed since each relation is a direct FK join, not a "latest row per video" aggregate. */
export function getVideoDetail(db: PrismaClient, id: string): Promise<VideoDetailRow | null> {
  return db.video.findUnique({
    where: { id },
    include: {
      channel: { select: { id: true, title: true, channelTier: true, currentSubscriberCount: true } },
      discoveryEvents: {
        orderBy: { discoveredAt: "desc" },
        take: DETAIL_DISCOVERY_EVENTS_LIMIT,
        select: { discoveredAt: true, source: true, market: { select: { code: true } } },
      },
      videoTopics: {
        select: { relationType: true, confidence: true, topic: { select: { id: true, canonicalName: true } } },
      },
    },
  }) as unknown as Promise<VideoDetailRow | null>;
}
