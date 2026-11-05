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
