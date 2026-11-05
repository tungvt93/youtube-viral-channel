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
