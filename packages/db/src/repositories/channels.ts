import type { Channel, PrismaClient } from "../../generated/client";

export interface ChannelUpsertInput {
  youtubeChannelId: string;
  title: string;
  description: string;
  customUrl: string | null;
  thumbnailUrl: string | null;
  creatorCountry: string | null;
  publishedAt: Date | null;
  uploadsPlaylistId: string | null;
  currentSubscriberCount: bigint | null;
  currentViewCount: bigint | null;
  currentVideoCount: bigint | null;
  subscriberCountHidden: boolean;
}

/**
 * Upserts a channel by its unique `youtube_channel_id`. Called from the
 * channel-enrichment processor, which only calls `channels.list` (playlist
 * fetching is out of scope for Phase 1, see PRD §25 Phase 4).
 */
export function upsertChannel(db: PrismaClient, input: ChannelUpsertInput): Promise<Channel> {
  const data = {
    title: input.title,
    description: input.description,
    customUrl: input.customUrl,
    thumbnailUrl: input.thumbnailUrl,
    creatorCountry: input.creatorCountry,
    publishedAt: input.publishedAt,
    uploadsPlaylistId: input.uploadsPlaylistId,
    currentSubscriberCount: input.currentSubscriberCount,
    currentViewCount: input.currentViewCount,
    currentVideoCount: input.currentVideoCount,
    subscriberCountHidden: input.subscriberCountHidden,
    lastEnrichedAt: new Date(),
  };
  return db.channel.upsert({
    where: { youtubeChannelId: input.youtubeChannelId },
    create: { youtubeChannelId: input.youtubeChannelId, ...data },
    update: data,
  });
}

/**
 * Creates a bare-minimum channel row from a discovery-time channel id alone,
 * so that `Video.channelId` can be set before full channel enrichment runs.
 * Fields required by the schema but not yet known are filled with
 * placeholders that `upsertChannel` overwrites once enrichment completes.
 */
export function ensureChannelStub(db: PrismaClient, youtubeChannelId: string): Promise<Channel> {
  return db.channel.upsert({
    where: { youtubeChannelId },
    create: {
      youtubeChannelId,
      title: "",
      description: "",
      subscriberCountHidden: false,
    },
    update: {},
  });
}

export function getChannelByYoutubeId(db: PrismaClient, youtubeChannelId: string): Promise<Channel | null> {
  return db.channel.findUnique({ where: { youtubeChannelId } });
}

export interface DueDiscoveryChannel {
  id: string;
  youtubeChannelId: string;
  uploadsPlaylistId: string;
  lastVideoDiscoveryAt: Date | null;
}

/**
 * Channels with a known uploads playlist (enrichment hasn't necessarily run
 * yet for every channel), ordered so never-polled channels (`null`) are
 * served before the longest-overdue ones — same oldest-due-first intent as
 * `listVideosDueForSnapshot`, adapted for a nullable "last polled" column
 * via Prisma's `nulls: "first"` ordering.
 */
export function listChannelsDueForVideoDiscovery(db: PrismaClient, limit: number): Promise<DueDiscoveryChannel[]> {
  return db.channel
    .findMany({
      where: { uploadsPlaylistId: { not: null } },
      orderBy: { lastVideoDiscoveryAt: { sort: "asc", nulls: "first" } },
      take: limit,
      select: { id: true, youtubeChannelId: true, uploadsPlaylistId: true, lastVideoDiscoveryAt: true },
    })
    .then((rows) => rows.map((row) => ({ ...row, uploadsPlaylistId: row.uploadsPlaylistId as string })));
}

export function updateChannelLastVideoDiscoveryAt(db: PrismaClient, channelId: string, lastVideoDiscoveryAt: Date): Promise<Channel> {
  return db.channel.update({ where: { id: channelId }, data: { lastVideoDiscoveryAt } });
}

export function updateChannelTier(db: PrismaClient, channelId: string, channelTier: string): Promise<Channel> {
  return db.channel.update({ where: { id: channelId }, data: { channelTier } });
}

export interface ScoringEligibleChannel {
  id: string;
  youtubeChannelId: string;
  channelTier: string;
  currentSubscriberCount: bigint | null;
  firstDiscoveredAt: Date;
}

/**
 * Candidate pool for a channel-scoring tick (PRD §9.3): any channel with at
 * least one video — whether it actually has *enough* video/snapshot data
 * for each of the four score components is decided per-metric by the
 * processor (missing-metric re-normalization, same as video scoring), not
 * filtered out here.
 */
export function listChannelsEligibleForScoring(db: PrismaClient, limit: number): Promise<ScoringEligibleChannel[]> {
  return db.channel.findMany({
    where: { videos: { some: {} } },
    orderBy: { lastEnrichedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, youtubeChannelId: true, channelTier: true, currentSubscriberCount: true, firstDiscoveredAt: true },
  });
}

export interface ChannelVideoForScoring {
  id: string;
  publishedAt: Date;
  currentViewCount: bigint | null;
}

/**
 * All of a channel's videos with the fields needed for the four §9.3
 * metrics (view counts for the median/outlier-ratio metric, publish times
 * for upload-consistency/recency) — one query per channel, same batching
 * discipline as `listChannelPeerViews` (caller invokes this once per
 * distinct channel in a tick, not per video).
 */
export function listChannelVideosForScoring(db: PrismaClient, channelId: string): Promise<ChannelVideoForScoring[]> {
  return db.video.findMany({
    where: { channelId },
    orderBy: { publishedAt: "desc" },
    select: { id: true, publishedAt: true, currentViewCount: true },
  });
}

export interface ChannelListFilter {
  tier?: string;
  limit: number;
  offset: number;
}

export interface ChannelListRow {
  id: string;
  youtubeChannelId: string;
  title: string;
  channelTier: string;
  currentSubscriberCount: bigint | null;
  currentViewCount: bigint | null;
  currentVideoCount: bigint | null;
  latestChannelScore: number | null;
  latestScoreComputedAt: Date | null;
}

/**
 * `GET /channels` backing query: latest `ChannelScore` per channel via a
 * `DISTINCT ON` raw query (one round trip, no N+1 — same discipline as
 * `listChannelPeerViews`), sorted by that latest score descending so the
 * most outlier-y channels surface first. Scoreless channels (no row yet)
 * still appear, via the `LEFT JOIN`, with a null score sorting last.
 */
export async function listChannels(db: PrismaClient, filter: ChannelListFilter): Promise<ChannelListRow[]> {
  const tierClause = filter.tier ? `WHERE c.channel_tier = $3` : "";
  const params: unknown[] = [filter.limit, filter.offset];
  if (filter.tier) {
    params.push(filter.tier);
  }
  return db.$queryRawUnsafe<ChannelListRow[]>(
    `
    SELECT
      c.id AS "id",
      c.youtube_channel_id AS "youtubeChannelId",
      c.title AS "title",
      c.channel_tier AS "channelTier",
      c.current_subscriber_count AS "currentSubscriberCount",
      c.current_view_count AS "currentViewCount",
      c.current_video_count AS "currentVideoCount",
      latest.channel_score AS "latestChannelScore",
      latest.computed_at AS "latestScoreComputedAt"
    FROM channels c
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (channel_id) channel_score, computed_at
      FROM channel_scores
      WHERE channel_id = c.id
      ORDER BY channel_id, computed_at DESC
    ) latest ON true
    ${tierClause}
    ORDER BY latest.channel_score DESC NULLS LAST, c.first_discovered_at DESC
    LIMIT $1 OFFSET $2
    `,
    ...params,
  );
}

export interface ChannelDetailRow {
  id: string;
  youtubeChannelId: string;
  title: string;
  description: string;
  channelTier: string;
  currentSubscriberCount: bigint | null;
  currentViewCount: bigint | null;
  currentVideoCount: bigint | null;
  latestChannelScore: number | null;
  latestScoreBreakdown: object | null;
  latestScoreDataConfidence: number | null;
  latestScoreComputedAt: Date | null;
}

/** `GET /channels/:id` backing query: the channel plus its single latest `ChannelScore` row (breakdown included), same `DISTINCT ON` shape as `listChannels`. */
export async function getChannelDetail(db: PrismaClient, channelId: string): Promise<ChannelDetailRow | null> {
  const rows = await db.$queryRawUnsafe<ChannelDetailRow[]>(
    `
    SELECT
      c.id AS "id",
      c.youtube_channel_id AS "youtubeChannelId",
      c.title AS "title",
      c.description AS "description",
      c.channel_tier AS "channelTier",
      c.current_subscriber_count AS "currentSubscriberCount",
      c.current_view_count AS "currentViewCount",
      c.current_video_count AS "currentVideoCount",
      latest.channel_score AS "latestChannelScore",
      latest.score_breakdown AS "latestScoreBreakdown",
      latest.data_confidence AS "latestScoreDataConfidence",
      latest.computed_at AS "latestScoreComputedAt"
    FROM channels c
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (channel_id) channel_score, score_breakdown, data_confidence, computed_at
      FROM channel_scores
      WHERE channel_id = c.id
      ORDER BY channel_id, computed_at DESC
    ) latest ON true
    WHERE c.id = $1
    `,
    channelId,
  );
  return rows[0] ?? null;
}
