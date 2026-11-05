import type { Job } from "bullmq";
import {
  finishJobRun,
  getDiscoveryQueryById,
  recordApiUsage,
  startJobRun,
  touchDiscoveryQueryLastRunAt,
} from "@yvi/db";
import { QUOTA_COST, YouTubeApiError, type VideoResourceItem } from "@yvi/youtube-client";
import { QUEUE_NAMES, type DiscoveryJobData, type VideoEnrichmentCandidate } from "@yvi/shared";
import { enqueueWithJobRun } from "../job-helpers";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "videos.list(mostPopular)";

/**
 * Discovery Strategy 1 (PRD §6.2): `videos.list?chart=mostPopular` per
 * enabled market, up to `maxPagesPerRun` pages. Writes no Video/DiscoveryEvent
 * rows itself — it only enqueues a batched video-enrichment job per page,
 * since the full `videos.list` call there is what supplies the NOT NULL
 * `category_id` the schema requires (see plan Decisions, 2026-11-05).
 *
 * Creates its own JobRun keyed by the BullMQ job's own id (see
 * `DiscoveryJobData`'s doc comment for why — the scheduler's repeat template
 * can't carry a freshly-minted jobRunId per tick).
 */
export function createDiscoveryRegionalProcessor(deps: ProcessorDeps) {
  return async function processDiscoveryRegional(job: Job<DiscoveryJobData>): Promise<{ discovered: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.discoveryRegional });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.discoveryRegional,
      startedAt,
    });

    const discoveryQuery = await getDiscoveryQueryById(deps.db, job.data.discoveryQueryId);
    if (!discoveryQuery || !discoveryQuery.enabled || !discoveryQuery.market.enabled) {
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: "discovery query not found, disabled, or market disabled",
      });
      return { discovered: 0 };
    }

    const market = discoveryQuery.market;
    const config = (discoveryQuery.config ?? {}) as { videoCategoryId?: string };

    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.videos_list * discoveryQuery.maxPagesPerRun, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked discovery-regional run");
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: `quota guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
      });
      return { discovered: 0 };
    }

    try {
      let pageToken: string | undefined;
      let page = 0;
      let totalDiscovered = 0;

      while (page < discoveryQuery.maxPagesPerRun) {
        let items: VideoResourceItem[];
        try {
          const result = await deps.youtube.listMostPopularVideos({
            regionCode: market.code,
            videoCategoryId: config.videoCategoryId,
            maxResults: 50,
            pageToken,
            maxHeight: 200,
          });
          await recordApiUsage(deps.db, {
            endpoint: ENDPOINT,
            quotaEstimate: QUOTA_COST.videos_list,
            status: "success",
            marketId: market.id,
            requestTime: now(),
          });
          items = result.items;
          pageToken = result.nextPageToken;
        } catch (error) {
          await recordApiUsage(deps.db, {
            endpoint: ENDPOINT,
            quotaEstimate: QUOTA_COST.videos_list,
            status: "error",
            marketId: market.id,
            requestTime: now(),
          });
          throw error;
        }

        if (items.length > 0) {
          const candidates: VideoEnrichmentCandidate[] = items.map((item, index) => ({
            videoId: item.videoId,
            sourceRank: page * 50 + index,
          }));
          await enqueueWithJobRun(
            deps.db,
            deps.queues.videoEnrichment,
            "video-enrichment",
            {
              marketId: market.id,
              discoveryQueryId: discoveryQuery.id,
              source: "most_popular",
              discoveredAt: now().toISOString(),
              items: candidates,
            },
            `${jobRun.id}:enrich:${page}`,
          );
          totalDiscovered += items.length;
        }

        page += 1;
        if (!pageToken) {
          break;
        }
      }

      await touchDiscoveryQueryLastRunAt(deps.db, discoveryQuery.id, now());
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: totalDiscovered,
        errorMessage: null,
      });
      return { discovered: totalDiscovered };
    } catch (error) {
      const message = error instanceof YouTubeApiError ? `${error.code}: ${error.message}` : String(error);
      log.error({ status: "error", errorCode: error instanceof YouTubeApiError ? error.code : "unknown" }, message);
      await finishJobRun(deps.db, {
        id: jobRun.id,
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
