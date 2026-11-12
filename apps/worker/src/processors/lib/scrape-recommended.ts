import {
  createDiscoveryEvent,
  getMarketByCode,
  getVideoIdsByYoutubeIds,
  markVideoRecommendedScraped,
  type RecommendedScrapeSeed,
} from "@yvi/db";
import { QUEUE_NAMES, type VideoEnrichmentCandidate } from "@yvi/shared";
import { enqueueWithJobRun } from "../../job-helpers";
import { fetchWatchPageHtml, WatchPageFetchError } from "../../scrape/fetch-watch-page";
import { parseRecommendedVideos } from "../../scrape/parse-recommended";
import type { ProcessorDeps } from "../deps";

/** Caps how many due seeds a single call scrapes, bounding wall-clock time given the inter-seed delay below. */
export const MAX_SEEDS_PER_RUN = 20;

/** Randomized delay between consecutive watch-page fetches within a run, to avoid a rapid-fire scrape pattern. */
const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 5000;

/** Rolling window of recent runs' `recommended.length` values, for degradation detection below. */
const DEGRADATION_WINDOW_SIZE = 20;

/** If the rolling average of recommended-videos-per-seed drops below this across a full window, YouTube's page markup likely changed. */
const DEGRADATION_WARN_THRESHOLD = 1;

const recentRecommendedCounts: number[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

export interface ScrapeRecommendedResult {
  seedsProcessed: number;
  newVideosEnqueued: number;
  knownVideosLinked: number;
  seedsFailed: number;
}

/**
 * For each seed video (oldest first), fetch its YouTube watch page, parse
 * the sidebar's recommended video ids, and fan genuinely-new ids onto the
 * existing `video-enrichment` queue while linking already-known ids directly
 * via a new `DiscoveryEvent` (mirrors `channel-video-discovery.ts`'s
 * known/new split).
 *
 * A single seed's fetch failure is logged and skipped, same as
 * `channel-video-discovery.ts`'s per-channel failure handling — but unlike
 * that processor, a run that's mostly failing (more than half the batch)
 * trips a circuit breaker and stops early, since a string of failures
 * usually means YouTube is blocking this run entirely rather than one seed
 * being bad.
 */
export async function scrapeRecommendedForSeeds(
  deps: ProcessorDeps,
  seeds: RecommendedScrapeSeed[],
  jobRunId: string,
): Promise<ScrapeRecommendedResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.logger.child({ jobRunId, queue: QUEUE_NAMES.recommendedScrape });

  let newVideosEnqueued = 0;
  let knownVideosLinked = 0;
  let failedCount = 0;

  for (let index = 0; index < seeds.length; index += 1) {
    if (index > 0) {
      if (failedCount > seeds.length / 2) {
        break;
      }
      await sleep(randomDelayMs());
    }

    const seed = seeds[index];
    try {
      const html = await fetchWatchPageHtml(seed.youtubeVideoId, seed.gl, seed.hl, deps.fetchImpl);
      const recommended = parseRecommendedVideos(html);

      recentRecommendedCounts.push(recommended.length);
      if (recentRecommendedCounts.length > DEGRADATION_WINDOW_SIZE) {
        recentRecommendedCounts.shift();
      }
      if (recentRecommendedCounts.length === DEGRADATION_WINDOW_SIZE) {
        const average = recentRecommendedCounts.reduce((sum, count) => sum + count, 0) / recentRecommendedCounts.length;
        if (average < DEGRADATION_WARN_THRESHOLD) {
          log.warn({ status: "degraded", average }, "recommended-videos-per-seed average has dropped below threshold");
        }
      }

      if (recommended.length > 0) {
        const youtubeIds = recommended.map((r) => r.youtubeVideoId);
        const knownIdMap = await getVideoIdsByYoutubeIds(deps.db, youtubeIds);
        const market = await getMarketByCode(deps.db, seed.gl);
        const lineage = {
          seedVideoId: seed.youtubeVideoId,
          rootSeedVideoId: seed.rootSeedVideoId,
          gl: seed.gl,
          hl: seed.hl,
        };

        const newCandidates: VideoEnrichmentCandidate[] = recommended
          .filter((r) => !knownIdMap.has(r.youtubeVideoId))
          .map((r) => ({ videoId: r.youtubeVideoId, sourceRank: r.sidebarRank }));

        if (newCandidates.length > 0) {
          await enqueueWithJobRun(
            deps.db,
            deps.queues.videoEnrichment,
            "video-enrichment",
            {
              marketId: market?.id ?? null,
              discoveryQueryId: null,
              source: "recommended_scrape",
              discoveredAt: now().toISOString(),
              sourcePayload: lineage,
              items: newCandidates,
            },
            `${jobRunId}:${seed.videoId}`,
          );
          newVideosEnqueued += newCandidates.length;
        }

        for (const r of recommended) {
          const knownVideoId = knownIdMap.get(r.youtubeVideoId);
          if (knownVideoId) {
            await createDiscoveryEvent(deps.db, {
              videoId: knownVideoId,
              marketId: market?.id ?? null,
              discoveryQueryId: null,
              source: "recommended_scrape",
              sourceRank: r.sidebarRank,
              discoveredAt: now(),
              sourcePayload: lineage,
            });
            knownVideosLinked += 1;
          }
        }
      }

      await markVideoRecommendedScraped(deps.db, seed.videoId, now());
    } catch (error) {
      const message = error instanceof WatchPageFetchError ? error.message : String(error);
      log.warn({ seedId: seed.videoId, status: "error" }, message);
      await markVideoRecommendedScraped(deps.db, seed.videoId, now());
      failedCount += 1;
    }
  }

  return { seedsProcessed: seeds.length, newVideosEnqueued, knownVideosLinked, seedsFailed: failedCount };
}
