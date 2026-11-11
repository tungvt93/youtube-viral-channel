import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { RecommendedScrapeJobData } from "@yvi/shared";
import type { Queues } from "../queues/index";

const {
  startJobRun,
  finishJobRun,
  listRecommendedScrapeSeeds,
  markVideoRecommendedScraped,
  getVideoIdsByYoutubeIds,
  getMarketByCode,
  createDiscoveryEvent,
} = vi.hoisted(() => ({
  startJobRun: vi.fn(),
  finishJobRun: vi.fn(),
  listRecommendedScrapeSeeds: vi.fn(),
  markVideoRecommendedScraped: vi.fn(),
  getVideoIdsByYoutubeIds: vi.fn(),
  getMarketByCode: vi.fn(),
  createDiscoveryEvent: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  startJobRun,
  finishJobRun,
  listRecommendedScrapeSeeds,
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
vi.mock("../scrape/fetch-watch-page", () => ({ fetchWatchPageHtml, WatchPageFetchError }));

const { parseRecommendedVideos } = vi.hoisted(() => ({ parseRecommendedVideos: vi.fn() }));
vi.mock("../scrape/parse-recommended", () => ({ parseRecommendedVideos }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../job-helpers", () => ({ enqueueWithJobRun }));

import { createRecommendedScrapeProcessor } from "./recommended-scrape";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<RecommendedScrapeJobData> {
  return { id: "tick-1", name: "recommended-scrape", data: {} } as unknown as Job<RecommendedScrapeJobData>;
}

const NOW = new Date("2026-11-11T12:00:00Z");

function makeSeed(overrides: Partial<{ videoId: string; youtubeVideoId: string; gl: string; hl: string; rootSeedVideoId: string }> = {}) {
  return {
    videoId: "v1",
    youtubeVideoId: "yt1",
    gl: "US",
    hl: "en",
    rootSeedVideoId: "v1",
    ...overrides,
  };
}

describe("createRecommendedScrapeProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "tick-1" });
    getMarketByCode.mockResolvedValue({ id: "market-us" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing and completes the JobRun when no seed is due", async () => {
    listRecommendedScrapeSeeds.mockResolvedValue([]);
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createRecommendedScrapeProcessor(deps)(makeJob());

    expect(result).toEqual({ seedsProcessed: 0, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "tick-1", status: "completed", resultCount: 0 }));
    expect(fetchWatchPageHtml).not.toHaveBeenCalled();
  });

  it("enqueues a video-enrichment job per seed for genuinely-new recommended ids, carrying root gl/hl in sourcePayload", async () => {
    const seed = makeSeed();
    listRecommendedScrapeSeeds.mockResolvedValue([seed]);
    fetchWatchPageHtml.mockResolvedValue("<html></html>");
    parseRecommendedVideos.mockReturnValue([{ youtubeVideoId: "new1", sidebarRank: 0 }]);
    getVideoIdsByYoutubeIds.mockResolvedValue(new Map());
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createRecommendedScrapeProcessor(deps)(makeJob());

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 1, knownVideosLinked: 0, seedsFailed: 0 });
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
      "tick-1:v1",
    );
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
    expect(createDiscoveryEvent).not.toHaveBeenCalled();
  });

  it("writes a DiscoveryEvent directly (no enrichment enqueue) for an already-known recommended id", async () => {
    const seed = makeSeed();
    listRecommendedScrapeSeeds.mockResolvedValue([seed]);
    fetchWatchPageHtml.mockResolvedValue("<html></html>");
    parseRecommendedVideos.mockReturnValue([{ youtubeVideoId: "known1", sidebarRank: 0 }]);
    getVideoIdsByYoutubeIds.mockResolvedValue(new Map([["known1", "internal-known1"]]));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createRecommendedScrapeProcessor(deps)(makeJob());

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 1, seedsFailed: 0 });
    expect(createDiscoveryEvent).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({
        videoId: "internal-known1",
        source: "recommended_scrape",
        sourceRank: 0,
      }),
    );
    expect(enqueueWithJobRun).not.toHaveBeenCalled();
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
  });

  it("marks the seed scraped and does not throw when the fetch fails", async () => {
    const seed = makeSeed();
    listRecommendedScrapeSeeds.mockResolvedValue([seed]);
    fetchWatchPageHtml.mockRejectedValue(new WatchPageFetchError(429));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createRecommendedScrapeProcessor(deps)(makeJob());

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 1 });
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
    expect(enqueueWithJobRun).not.toHaveBeenCalled();
    expect(createDiscoveryEvent).not.toHaveBeenCalled();
  });

  it("marks the seed scraped when parseRecommendedVideos returns an empty array", async () => {
    const seed = makeSeed();
    listRecommendedScrapeSeeds.mockResolvedValue([seed]);
    fetchWatchPageHtml.mockResolvedValue("<html></html>");
    parseRecommendedVideos.mockReturnValue([]);
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createRecommendedScrapeProcessor(deps)(makeJob());

    expect(result).toEqual({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    expect(markVideoRecommendedScraped).toHaveBeenCalledWith(deps.db, "v1", NOW);
    expect(enqueueWithJobRun).not.toHaveBeenCalled();
    expect(createDiscoveryEvent).not.toHaveBeenCalled();
    expect(getVideoIdsByYoutubeIds).not.toHaveBeenCalled();
  });

  it("stops processing the rest of the batch once more than half of it has failed", async () => {
    vi.useFakeTimers();
    const seeds = [
      makeSeed({ videoId: "v1", youtubeVideoId: "yt1" }),
      makeSeed({ videoId: "v2", youtubeVideoId: "yt2" }),
      makeSeed({ videoId: "v3", youtubeVideoId: "yt3" }),
      makeSeed({ videoId: "v4", youtubeVideoId: "yt4" }),
    ];
    listRecommendedScrapeSeeds.mockResolvedValue(seeds);
    fetchWatchPageHtml.mockRejectedValue(new WatchPageFetchError(500));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues, logger: makeLogger() as never, now: () => NOW };

    const resultPromise = createRecommendedScrapeProcessor(deps)(makeJob());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchWatchPageHtml).toHaveBeenCalledTimes(3);
    expect(result.seedsFailed).toBe(3);
  });
});
