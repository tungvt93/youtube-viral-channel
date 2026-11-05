import type { Job } from "bullmq";
import {
  finishJobRun,
  getDiscoveryQueryById,
  recordApiUsage,
  startJobRun,
  touchDiscoveryQueryLastRunAt,
} from "@yvi/db";
import { QUOTA_COST, YouTubeApiError, type SearchResultItem } from "@yvi/youtube-client";
import { QUEUE_NAMES, type DiscoveryJobData, type VideoEnrichmentCandidate } from "@yvi/shared";
import { enqueueWithJobRun } from "../job-helpers";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "search.list";
const DEFAULT_LOOKBACK_HOURS = 24;

interface DiscoverySearchConfig {
  order?: "date" | "viewCount" | "relevance";
  videoDuration?: "short" | "medium" | "long" | "any";
  publishedAfterHours?: number;
}

/**
 * Discovery Strategy 2 (PRD §6.3): `search.list` per enabled query, up to
 * `maxPagesPerRun` pages. Defaults to `videoDuration=short` per the plan's
 * 2026-11-05 "prioritize Shorts" decision. Writes no Video rows itself —
 * `search.list` doesn't return `categoryId`, so candidates are only
 * enqueued for video-enrichment (see plan Decisions).
 *
 * Creates its own JobRun keyed by the BullMQ job's own id — see
 * `DiscoveryJobData`'s doc comment.
 */
export function createDiscoverySearchProcessor(deps: ProcessorDeps) {
  return async function processDiscoverySearch(job: Job<DiscoveryJobData>): Promise<{ discovered: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.discoverySearch });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.discoverySearch,
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
    const config = (discoveryQuery.config ?? {}) as DiscoverySearchConfig;
    const lookbackHours = config.publishedAfterHours ?? DEFAULT_LOOKBACK_HOURS;
    const publishedAfter = new Date(startedAt.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();

    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.search_list * discoveryQuery.maxPagesPerRun, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked discovery-search run");
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
        let items: SearchResultItem[];
        try {
          const result = await deps.youtube.search({
            q: discoveryQuery.query,
            regionCode: market.code,
            relevanceLanguage: discoveryQuery.language,
            publishedAfter,
            order: config.order ?? "date",
            videoDuration: config.videoDuration ?? "short",
            maxResults: 50,
            pageToken,
          });
          await recordApiUsage(deps.db, {
            endpoint: ENDPOINT,
            quotaEstimate: QUOTA_COST.search_list,
            status: "success",
            marketId: market.id,
            requestTime: now(),
          });
          items = result.items;
          pageToken = result.nextPageToken;
        } catch (error) {
          await recordApiUsage(deps.db, {
            endpoint: ENDPOINT,
            quotaEstimate: QUOTA_COST.search_list,
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
              source: "search",
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
