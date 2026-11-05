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
