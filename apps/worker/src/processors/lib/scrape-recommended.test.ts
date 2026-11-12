import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendedScrapeSeed } from "@yvi/db";
import type { Queues } from "../../queues/index";

const {
  markVideoRecommendedScraped,
  getVideoIdsByYoutubeIds,
  getMarketByCode,
  createDiscoveryEvent,
} = vi.hoisted(() => ({
  markVideoRecommendedScraped: vi.fn(),
  getVideoIdsByYoutubeIds: vi.fn(),
  getMarketByCode: vi.fn(),
  createDiscoveryEvent: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  markVideoRecommendedScraped,
  getVideoIdsByYoutubeIds,
  getMarketByCode,
  createDiscoveryEvent,
}));

const { fetchWatchPageHtml, WatchPageFetchError } = vi.hoisted(() => {
  class WatchPageFetchError extends Error {
    constructor(public readonly status: number) {
      super(`watch page fetch failed with status ${status}`);
    }
  }
  return { fetchWatchPageHtml: vi.fn(), WatchPageFetchError };
});
vi.mock("../../scrape/fetch-watch-page", () => ({ fetchWatchPageHtml, WatchPageFetchError }));

const { parseRecommendedVideos } = vi.hoisted(() => ({ parseRecommendedVideos: vi.fn() }));
vi.mock("../../scrape/parse-recommended", () => ({ parseRecommendedVideos }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../../job-helpers", () => ({ enqueueWithJobRun }));

import { scrapeRecommendedForSeeds } from "./scrape-recommended";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

const NOW = new Date("2026-11-11T12:00:00Z");

function makeSeed(overrides: Partial<RecommendedScrapeSeed> = {}): RecommendedScrapeSeed {
  return {
    videoId: "v1",
    youtubeVideoId: "yt1",
    gl: "US",
    hl: "en",
    rootSeedVideoId: "v1",
    ...overrides,
  };
}

describe("scrapeRecommendedForSeeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMarketByCode.mockResolvedValue({ id: "market-us" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all-zero counts for an empty seeds array without any db/network calls", async () => {
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await scrapeRecommendedForSeeds(deps, [], "run-1");

    expect(result).toEqual({ seedsProcessed: 0, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    expect(fetchWatchPageHtml).not.toHaveBeenCalled();
    expect(getVideoIdsByYoutubeIds).not.toHaveBeenCalled();
  });

  it("enqueues video-enrichment for new recommended ids and links known ones via DiscoveryEvent", async () => {
    const seeds = [makeSeed({ videoId: "v1", youtubeVideoId: "yt1" })];
    fetchWatchPageHtml.mockResolvedValue("<html></html>");
    parseRecommendedVideos.mockReturnValue([
      { youtubeVideoId: "new1", sidebarRank: 0 },
      { youtubeVideoId: "known1", sidebarRank: 1 },
    ]);
    getVideoIdsByYoutubeIds.mockResolvedValue(new Map([["known1", "internal-known1"]]));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await scrapeRecommendedForSeeds(deps, seeds, "run-1");

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 1, knownVideosLinked: 1, seedsFailed: 0 });
    expect(fetchWatchPageHtml).toHaveBeenCalledWith("yt1", "US", "en", undefined);
    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      queues.videoEnrichment,
      "video-enrichment",
      expect.objectContaining({
        marketId: "market-us",
        discoveryQueryId: null,
        source: "recommended_scrape",
        sourcePayload: { seedVideoId: "yt1", rootSeedVideoId: "v1", gl: "US", hl: "en" },
        items: [{ videoId: "new1", sourceRank: 0 }],
      }),
      "run-1:v1",
    );
    expect(createDiscoveryEvent).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ videoId: "internal-known1", source: "recommended_scrape", sourceRank: 1 }),
    );
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
  });

  it("marks a seed scraped even when its fetch fails, and counts it as failed", async () => {
    const seeds = [makeSeed({ videoId: "v1", youtubeVideoId: "yt1" })];
    fetchWatchPageHtml.mockRejectedValue(new WatchPageFetchError(429));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await scrapeRecommendedForSeeds(deps, seeds, "run-1");

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 1 });
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
    expect(enqueueWithJobRun).not.toHaveBeenCalled();
    expect(createDiscoveryEvent).not.toHaveBeenCalled();
  });

  it("trips the circuit breaker and stops early once failures exceed half the seeds", async () => {
    vi.useFakeTimers();
    const seeds = [
      makeSeed({ videoId: "v1", youtubeVideoId: "yt1" }),
      makeSeed({ videoId: "v2", youtubeVideoId: "yt2" }),
      makeSeed({ videoId: "v3", youtubeVideoId: "yt3" }),
      makeSeed({ videoId: "v4", youtubeVideoId: "yt4" }),
    ];
    fetchWatchPageHtml.mockRejectedValue(new WatchPageFetchError(500));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const resultPromise = scrapeRecommendedForSeeds(deps, seeds, "run-1");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchWatchPageHtml).toHaveBeenCalledTimes(3);
    expect(result.seedsFailed).toBe(3);
  });

  it("logs a degradation warning once the rolling average drops below threshold", async () => {
    vi.useFakeTimers();
    const seeds = Array.from({ length: 20 }, (_, i) =>
      makeSeed({ videoId: `v${i}`, youtubeVideoId: `yt${i}` }),
    );
    fetchWatchPageHtml.mockResolvedValue("<html></html>");
    parseRecommendedVideos.mockReturnValue([]);
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const logger = makeLogger();
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: logger as never, now: () => NOW };

    const resultPromise = scrapeRecommendedForSeeds(deps, seeds, "run-1");
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(logger._child.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "degraded" }),
      expect.stringContaining("recommended-videos-per-seed average has dropped below threshold"),
    );
  });
});
