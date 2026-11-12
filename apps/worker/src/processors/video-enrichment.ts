import type { Job } from "bullmq";
import { finishJobRun } from "@yvi/db";
import { YouTubeApiError } from "@yvi/youtube-client";
import type { VideoEnrichmentJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { enrichVideoIds, QuotaGuardBlockedError, type EnrichVideoIdsProgress } from "./lib/enrich-videos";

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
    const rankByVideoId = new Map(job.data.items.map((item) => [item.videoId, item.sourceRank]));
    const progress: EnrichVideoIdsProgress = { savedVideos: [], discoveredChannelIds: new Set() };

    try {
      await enrichVideoIds(
        deps,
        {
          ids,
          rankByVideoId,
          marketId: job.data.marketId,
          discoveryQueryId: job.data.discoveryQueryId,
          source: job.data.source,
          discoveredAt: new Date(job.data.discoveredAt),
          sourcePayload: job.data.sourcePayload,
          jobRunId: job.data.jobRunId,
        },
        progress,
        now,
      );

      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: progress.savedVideos.length,
        errorMessage: null,
      });
      return { enriched: progress.savedVideos.length };
    } catch (error) {
      if (error instanceof QuotaGuardBlockedError) {
        log.warn({ status: "blocked", quotaEstimate: error.projectedUsage }, "quota guard blocked video-enrichment run");
        await finishJobRun(deps.db, {
          id: job.data.jobRunId,
          status: "failed",
          finishedAt: now(),
          durationMs: 0,
          resultCount: null,
          errorMessage: error.message,
        });
        return { enriched: 0 };
      }

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
