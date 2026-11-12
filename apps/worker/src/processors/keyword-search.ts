import type { Job } from "bullmq";
import {
  finishJobRun,
  finishKeywordSearch,
  getMarketById,
  markKeywordSearchRunning,
  recordApiUsage,
  type RecommendedScrapeSeed,
} from "@yvi/db";
import { QUOTA_COST, YouTubeApiError } from "@yvi/youtube-client";
import { QUEUE_NAMES, type KeywordSearchJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";
import { enrichVideoIds, QuotaGuardBlockedError, type EnrichVideoIdsProgress } from "./lib/enrich-videos";
import { MAX_SEEDS_PER_RUN, scrapeRecommendedForSeeds } from "./lib/scrape-recommended";

const ENDPOINT = "search.list";

/**
 * On-demand keyword search: a single `search.list` call for `job.data.query`,
 * then in-process `enrichVideoIds` + `scrapeRecommendedForSeeds` for whatever
 * it finds, writing final status to both the `KeywordSearch` row and its
 * paired `JobRun` (see `KeywordSearchJobData`'s doc comment for why this
 * processor never calls `startJobRun`).
 */
export function createKeywordSearchProcessor(deps: ProcessorDeps) {
  return async function processKeywordSearch(
    job: Job<KeywordSearchJobData>,
  ): Promise<{ videosFound: number; recommendedVideosFound: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.keywordSearch });

    await markKeywordSearchRunning(deps.db, job.data.keywordSearchId);
    const market = await getMarketById(deps.db, job.data.marketId);

    const progress: EnrichVideoIdsProgress = { savedVideos: [], discoveredChannelIds: new Set() };
    let recommendedVideosFound = 0;

    try {
      const searchGuard = await checkQuotaGuard(deps.db, QUOTA_COST.search_list, startedAt);
      if (!searchGuard.allowed) {
        throw new QuotaGuardBlockedError(searchGuard.projectedUsage);
      }

      let result;
      try {
        result = await deps.youtube.search({
          q: job.data.query,
          regionCode: market?.code,
          relevanceLanguage: job.data.language,
          order: "date",
          videoDuration: "short",
          maxResults: 50,
        });
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.search_list,
          status: "success",
          marketId: job.data.marketId,
          requestTime: now(),
        });
      } catch (error) {
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.search_list,
          status: "error",
          marketId: job.data.marketId,
          requestTime: now(),
        });
        throw error;
      }

      if (result.items.length > 0) {
        const rankByVideoId = new Map(result.items.map((item, index) => [item.videoId, index]));
        await enrichVideoIds(
          deps,
          {
            ids: result.items.map((item) => item.videoId),
            rankByVideoId,
            marketId: job.data.marketId,
            discoveryQueryId: null,
            source: "keyword_search",
            discoveredAt: now(),
            jobRunId: job.data.jobRunId,
          },
          progress,
          now,
        );

        const seeds: RecommendedScrapeSeed[] = progress.savedVideos.slice(0, MAX_SEEDS_PER_RUN).map((v) => ({
          videoId: v.id,
          youtubeVideoId: v.youtubeVideoId,
          gl: market!.code,
          hl: job.data.language,
          rootSeedVideoId: v.youtubeVideoId,
        }));
        const scrapeResult = await scrapeRecommendedForSeeds(deps, seeds, job.data.jobRunId);
        recommendedVideosFound = scrapeResult.newVideosEnqueued + scrapeResult.knownVideosLinked;
      }

      await finishKeywordSearch(deps.db, {
        id: job.data.keywordSearchId,
        status: "completed",
        videosFound: progress.savedVideos.length,
        recommendedVideosFound,
        errorMessage: null,
        finishedAt: now(),
      });
      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: progress.savedVideos.length,
        errorMessage: null,
      });
      return { videosFound: progress.savedVideos.length, recommendedVideosFound };
    } catch (error) {
      const message =
        error instanceof QuotaGuardBlockedError
          ? error.message
          : error instanceof YouTubeApiError
            ? `${error.code}: ${error.message}`
            : String(error);
      log.error({ status: "error" }, message);
      await finishKeywordSearch(deps.db, {
        id: job.data.keywordSearchId,
        status: "failed",
        videosFound: progress.savedVideos.length,
        recommendedVideosFound,
        errorMessage: message,
        finishedAt: now(),
      });
      await finishJobRun(deps.db, {
        id: job.data.jobRunId,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: message,
      });
      if (error instanceof QuotaGuardBlockedError) {
        return { videosFound: progress.savedVideos.length, recommendedVideosFound };
      }
      throw error;
    }
  };
}
