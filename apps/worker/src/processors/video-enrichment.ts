import type { Job } from "bullmq";
import {
  createDiscoveryEvent,
  ensureChannelStub,
  finishJobRun,
  recordApiUsage,
  upsertVideo,
} from "@yvi/db";
import { classifyFormat, QUOTA_COST, YouTubeApiError } from "@yvi/youtube-client";
import type { VideoEnrichmentJobData } from "@yvi/shared";
import { enqueueWithJobRun } from "../job-helpers";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "videos.list(byId)";

/**
 * Enriches a batch of up to 50 video ids discovered in one page by a
 * discovery-regional/discovery-search job: a single batched `videos.list`
 * call, upsert per video (dedup on `youtube_video_id`), a DiscoveryEvent per
 * video carrying the original discovery context, and a channel-enrichment
 * fan-out for any new channel ids.
 */
export function createVideoEnrichmentProcessor(deps: ProcessorDeps) {
  return async function processVideoEnrichment(job: Job<VideoEnrichmentJobData>): Promise<{ enriched: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: "video-enrichment" });

    const ids = job.data.items.map((item) => item.videoId);
    const batches = Math.ceil(ids.length / 50);

    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.videos_list * batches, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked video-enrichment run");
      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "failed",
        finishedAt: now(),
        durationMs: 0,
        resultCount: null,
        errorMessage: `quota guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
      });
      return { enriched: 0 };
    }

    try {
      let result;
      try {
        result = await deps.youtube.listVideosByIds(ids, { includePlayer: true, maxHeight: 200 });
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.videos_list * result.callsMade,
          status: "success",
          marketId: job.data.marketId,
          requestTime: now(),
        });
      } catch (error) {
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.videos_list * batches,
          status: "error",
          marketId: job.data.marketId,
          requestTime: now(),
        });
        throw error;
      }

      const rankByVideoId = new Map(job.data.items.map((item) => [item.videoId, item.sourceRank]));
      const discoveredChannelIds = new Set<string>();

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
          discoveredChannelIds.add(video.channelId);
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

        await createDiscoveryEvent(deps.db, {
          videoId: savedVideo.id,
          marketId: job.data.marketId,
          discoveryQueryId: job.data.discoveryQueryId,
          source: job.data.source,
          sourceRank: rankByVideoId.get(video.videoId) ?? null,
          discoveredAt: new Date(job.data.discoveredAt),
          sourcePayload: job.data.sourcePayload ?? null,
        });
      }

      if (discoveredChannelIds.size > 0) {
        await enqueueWithJobRun(
          deps.db,
          deps.queues.channelEnrichment,
          "channel-enrichment",
          { youtubeChannelIds: Array.from(discoveredChannelIds) },
          `${job.data.jobRunId}:channels`,
        );
      }

      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: result.items.length,
        errorMessage: null,
      });
      return { enriched: result.items.length };
    } catch (error) {
      const message = error instanceof YouTubeApiError ? `${error.code}: ${error.message}` : String(error);
      log.error({ status: "error", errorCode: error instanceof YouTubeApiError ? error.code : "unknown" }, message);
      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: message,
      });
      throw error;
    }
  };
}
