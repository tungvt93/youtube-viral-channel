import type { Job } from "bullmq";
import { finishJobRun, recordApiUsage, upsertChannel } from "@yvi/db";
import { QUOTA_COST, YouTubeApiError } from "@yvi/youtube-client";
import type { ChannelEnrichmentJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "channels.list";

/**
 * Enriches up to 50 channel ids fanned out from video-enrichment in a
 * single batched `channels.list` call. `channels.list` has no regionCode
 * param, so usage is recorded against no particular market (PRD §16.6 —
 * playlist/upload fetching is out of scope here, see Phase 4).
 */
export function createChannelEnrichmentProcessor(deps: ProcessorDeps) {
  return async function processChannelEnrichment(job: Job<ChannelEnrichmentJobData>): Promise<{ enriched: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: "channel-enrichment" });

    const ids = job.data.youtubeChannelIds;
    const batches = Math.ceil(ids.length / 50);

    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.channels_list * batches, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked channel-enrichment run");
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
        result = await deps.youtube.listChannelsByIds(ids);
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.channels_list * result.callsMade,
          status: "success",
          marketId: null,
          requestTime: now(),
        });
      } catch (error) {
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.channels_list * batches,
          status: "error",
          marketId: null,
          requestTime: now(),
        });
        throw error;
      }

      for (const channel of result.items) {
        await upsertChannel(deps.db, {
          youtubeChannelId: channel.channelId,
          title: channel.title,
          description: channel.description,
          customUrl: channel.customUrl ?? null,
          thumbnailUrl: channel.thumbnailUrl ?? null,
          creatorCountry: channel.country ?? null,
          publishedAt: channel.publishedAt ? new Date(channel.publishedAt) : null,
          uploadsPlaylistId: channel.uploadsPlaylistId ?? null,
          currentSubscriberCount: channel.subscriberCount !== undefined ? BigInt(channel.subscriberCount) : null,
          currentViewCount: channel.viewCount !== undefined ? BigInt(channel.viewCount) : null,
          currentVideoCount: channel.videoCount !== undefined ? BigInt(channel.videoCount) : null,
          subscriberCountHidden: channel.subscriberCountHidden ?? false,
        });
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
