import type { Job } from "bullmq";
import { finishJobRun, listRecommendedScrapeSeeds, startJobRun } from "@yvi/db";
import { QUEUE_NAMES, type RecommendedScrapeJobData } from "@yvi/shared";
import { MAX_SEEDS_PER_RUN, scrapeRecommendedForSeeds } from "./lib/scrape-recommended";
import type { ProcessorDeps } from "./deps";

/**
 * One tick = scrape recommendations for whichever seed videos are due,
 * oldest first, via `scrapeRecommendedForSeeds` (shared with the on-demand
 * keyword-search pipeline).
 */
export function createRecommendedScrapeProcessor(deps: ProcessorDeps) {
  return async function processRecommendedScrape(
    job: Job<RecommendedScrapeJobData>,
  ): Promise<{ seedsProcessed: number; newVideosEnqueued: number; knownVideosLinked: number; seedsFailed: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.recommendedScrape,
      startedAt,
    });

    const seeds = await listRecommendedScrapeSeeds(deps.db, MAX_SEEDS_PER_RUN, now());
    if (seeds.length === 0) {
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: 0,
        errorMessage: null,
      });
      return { seedsProcessed: 0, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 };
    }

    const result = await scrapeRecommendedForSeeds(deps, seeds, jobRun.id);

    await finishJobRun(deps.db, {
      id: jobRun.id,
      status: "completed",
      finishedAt: now(),
      durationMs: now().getTime() - startedAt.getTime(),
      resultCount: result.newVideosEnqueued,
      errorMessage: null,
    });
    return result;
  };
}
