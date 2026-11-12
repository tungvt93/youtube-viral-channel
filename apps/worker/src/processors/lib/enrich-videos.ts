import {
  createDiscoveryEvent,
  ensureChannelStub,
  recordApiUsage,
  upsertVideo,
} from "@yvi/db";
import type { Prisma } from "@yvi/db";
import { classifyFormat, QUOTA_COST } from "@yvi/youtube-client";
import { enqueueWithJobRun } from "../../job-helpers";
import type { ProcessorDeps } from "../deps";
import { checkQuotaGuard } from "../quota";

const ENDPOINT = "videos.list(byId)";

export class QuotaGuardBlockedError extends Error {
  constructor(public readonly projectedUsage: number) {
    super(`quota guard: projected usage ${projectedUsage} exceeds daily budget`);
  }
}

export interface EnrichVideoIdsParams {
  ids: string[];
  rankByVideoId: Map<string, number | null>;
  marketId: string | null;
  discoveryQueryId: string | null;
  source: string;
  discoveredAt: Date;
  sourcePayload?: Record<string, unknown> | null;
  jobRunId: string;
}

export interface EnrichedVideo {
  id: string;
  youtubeVideoId: string;
}

/** Mutated incrementally (one push per video actually upserted) so a caller still has partial progress if this throws partway through. */
export interface EnrichVideoIdsProgress {
  savedVideos: EnrichedVideo[];
  discoveredChannelIds: Set<string>;
}

/**
 * Enriches a batch of up to 50 video ids: a single batched `videos.list`
 * call, upsert per video (dedup on `youtube_video_id`), a DiscoveryEvent per
 * video carrying the original discovery context, and a channel-enrichment
 * fan-out for any new channel ids. Throws (and leaves `progress` reflecting
 * whatever committed so far) instead of returning a sentinel on quota-block
 * or API/DB failure, so a caller can decide how to report that itself.
 */
export async function enrichVideoIds(
  deps: ProcessorDeps,
  params: EnrichVideoIdsParams,
  progress: EnrichVideoIdsProgress,
  now: () => Date,
): Promise<void> {
  const startedAt = now();
  const batches = Math.ceil(params.ids.length / 50);

  const guard = await checkQuotaGuard(deps.db, QUOTA_COST.videos_list * batches, startedAt);
  if (!guard.allowed) {
    throw new QuotaGuardBlockedError(guard.projectedUsage);
  }

  let result;
  try {
    result = await deps.youtube.listVideosByIds(params.ids, { includePlayer: true, maxHeight: 200 });
    await recordApiUsage(deps.db, {
      endpoint: ENDPOINT,
      quotaEstimate: QUOTA_COST.videos_list * result.callsMade,
      status: "success",
      marketId: params.marketId,
      requestTime: now(),
    });
  } catch (error) {
    await recordApiUsage(deps.db, {
      endpoint: ENDPOINT,
      quotaEstimate: QUOTA_COST.videos_list * batches,
      status: "error",
      marketId: params.marketId,
      requestTime: now(),
    });
    throw error;
  }

  for (const video of result.items) {
    const classification = classifyFormat({
      durationSeconds: video.durationSeconds,
      title: video.title,
      description: video.description,
      embedWidth: video.embedWidth,
      embedHeight: video.embedHeight,
    });

    let internalChannelId: string | null = null;
    if (video.channelId) {
      const channelStub = await ensureChannelStub(deps.db, video.channelId);
      internalChannelId = channelStub.id;
      progress.discoveredChannelIds.add(video.channelId);
    }

    const savedVideo = await upsertVideo(deps.db, {
      youtubeVideoId: video.videoId,
      channelId: internalChannelId,
      title: video.title,
      description: video.description,
      publishedAt: new Date(video.publishedAt),
      durationSeconds: video.durationSeconds,
      categoryId: video.categoryId,
      defaultLanguage: video.defaultLanguage ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
      currentViewCount: video.viewCount !== undefined ? BigInt(video.viewCount) : null,
      currentLikeCount: video.likeCount !== undefined ? BigInt(video.likeCount) : null,
      currentCommentCount: video.commentCount !== undefined ? BigInt(video.commentCount) : null,
      videoLicense: video.videoLicense ?? null,
      privacyStatus: video.privacyStatus ?? null,
      embeddable: video.embeddable ?? null,
      liveBroadcastContent: video.liveBroadcastContent ?? null,
      formatClassification: classification.classification,
      formatConfidence: classification.confidence,
      tags: video.tags ?? [],
    });

    progress.savedVideos.push({ id: savedVideo.id, youtubeVideoId: video.videoId });

    await createDiscoveryEvent(deps.db, {
      videoId: savedVideo.id,
      marketId: params.marketId,
      discoveryQueryId: params.discoveryQueryId,
      source: params.source,
      sourceRank: params.rankByVideoId.get(video.videoId) ?? null,
      discoveredAt: params.discoveredAt,
      sourcePayload: (params.sourcePayload ?? null) as Prisma.InputJsonValue | null,
    });
  }

  if (progress.discoveredChannelIds.size > 0) {
    await enqueueWithJobRun(
      deps.db,
      deps.queues.channelEnrichment,
      "channel-enrichment",
      { youtubeChannelIds: Array.from(progress.discoveredChannelIds) },
      `${params.jobRunId}:channels`,
    );
  }
}
