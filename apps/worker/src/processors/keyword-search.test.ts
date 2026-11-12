import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { KeywordSearchJobData } from "@yvi/shared";
import type { Queues } from "../queues/index";

const { markKeywordSearchRunning, finishKeywordSearch, getMarketById, finishJobRun } = vi.hoisted(() => ({
  markKeywordSearchRunning: vi.fn(),
  finishKeywordSearch: vi.fn(),
  getMarketById: vi.fn(),
  finishJobRun: vi.fn(),
}));

const { recordApiUsage } = vi.hoisted(() => ({ recordApiUsage: vi.fn() }));

vi.mock("@yvi/db", () => ({
  markKeywordSearchRunning,
  finishKeywordSearch,
  getMarketById,
  finishJobRun,
  recordApiUsage,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

const { enrichVideoIds, QuotaGuardBlockedError } = vi.hoisted(() => ({
  enrichVideoIds: vi.fn(),
  QuotaGuardBlockedError: class QuotaGuardBlockedError extends Error {
    constructor(public readonly projectedUsage: number) {
      super(`quota guard: projected usage ${projectedUsage} exceeds daily budget`);
    }
  },
}));
vi.mock("./lib/enrich-videos", () => ({ enrichVideoIds, QuotaGuardBlockedError }));

const { scrapeRecommendedForSeeds, MAX_SEEDS_PER_RUN } = vi.hoisted(() => ({
  scrapeRecommendedForSeeds: vi.fn(),
  MAX_SEEDS_PER_RUN: 20,
}));
vi.mock("./lib/scrape-recommended", () => ({ scrapeRecommendedForSeeds, MAX_SEEDS_PER_RUN }));

import { createKeywordSearchProcessor } from "./keyword-search";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(overrides?: Partial<KeywordSearchJobData>): Job<KeywordSearchJobData> {
  return {
    id: "job-ks-1",
    name: "keyword-search",
    data: {
      jobRunId: "run-ks-1",
      keywordSearchId: "ks-1",
      query: "viral shorts",
      marketId: "market-1",
      language: "en",
      ...overrides,
    },
  } as unknown as Job<KeywordSearchJobData>;
}

const MARKET = { id: "market-1", code: "US", enabled: true };

describe("createKeywordSearchProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the search running, then completed with videosFound/recommendedVideosFound counts on a normal run", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockResolvedValue({ items: [{ videoId: "v1" }, { videoId: "v2" }], nextPageToken: undefined });
    enrichVideoIds.mockImplementation(async (_deps, _params, progress) => {
      progress.savedVideos.push({ id: "internal-v1", youtubeVideoId: "v1" }, { id: "internal-v2", youtubeVideoId: "v2" });
    });
    scrapeRecommendedForSeeds.mockResolvedValue({ seedsProcessed: 2, newVideosEnqueued: 3, knownVideosLinked: 1, seedsFailed: 0 });
    const logger = makeLogger();
    const queues = {} as unknown as Queues;
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    const result = await processor(makeJob());

    expect(markKeywordSearchRunning).toHaveBeenCalledWith(deps.db, "ks-1");
    expect(result).toEqual({ videosFound: 2, recommendedVideosFound: 4 });
    expect(finishKeywordSearch).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ id: "ks-1", status: "completed", videosFound: 2, recommendedVideosFound: 4, errorMessage: null }),
    );
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "run-ks-1", status: "completed", resultCount: 2 }));
  });

  it("ends completed with videosFound=0 and recommendedVideosFound=0 when search.list returns no items", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockResolvedValue({ items: [], nextPageToken: undefined });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ videosFound: 0, recommendedVideosFound: 0 });
    expect(enrichVideoIds).not.toHaveBeenCalled();
    expect(scrapeRecommendedForSeeds).not.toHaveBeenCalled();
    expect(finishKeywordSearch).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ status: "completed", videosFound: 0, recommendedVideosFound: 0 }),
    );
  });

  it("ends failed with the quota-guard message, and does not call youtube.search, when the search-step guard blocks", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn();
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    const result = await processor(makeJob());

    expect(search).not.toHaveBeenCalled();
    expect(result).toEqual({ videosFound: 0, recommendedVideosFound: 0 });
    expect(finishKeywordSearch).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ status: "failed", errorMessage: "quota guard: projected usage 10001 exceeds daily budget" }),
    );
    expect(finishJobRun).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ status: "failed", errorMessage: "quota guard: projected usage 10001 exceeds daily budget" }),
    );
  });

  it("ends failed with the quota-guard message, and persists the videosFound count completed so far, when enrichVideoIds throws QuotaGuardBlockedError partway through", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockResolvedValue({ items: [{ videoId: "v1" }, { videoId: "v2" }], nextPageToken: undefined });
    enrichVideoIds.mockImplementation(async (_deps, _params, progress) => {
      progress.savedVideos.push({ id: "internal-v1", youtubeVideoId: "v1" });
      throw new QuotaGuardBlockedError(10050);
    });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ videosFound: 1, recommendedVideosFound: 0 });
    expect(scrapeRecommendedForSeeds).not.toHaveBeenCalled();
    expect(finishKeywordSearch).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({
        status: "failed",
        videosFound: 1,
        recommendedVideosFound: 0,
        errorMessage: "quota guard: projected usage 10050 exceeds daily budget",
      }),
    );
  });

  it("ends completed with a 0 recommendedVideosFound but videosFound>0 when scrapeRecommendedForSeeds finds nothing", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockResolvedValue({ items: [{ videoId: "v1" }], nextPageToken: undefined });
    enrichVideoIds.mockImplementation(async (_deps, _params, progress) => {
      progress.savedVideos.push({ id: "internal-v1", youtubeVideoId: "v1" });
    });
    scrapeRecommendedForSeeds.mockResolvedValue({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ videosFound: 1, recommendedVideosFound: 0 });
    expect(finishKeywordSearch).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ status: "completed", videosFound: 1, recommendedVideosFound: 0 }),
    );
  });

  it('writes DiscoveryEvent source "keyword_search" via enrichVideoIds\'s params, not "search"', async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockResolvedValue({ items: [{ videoId: "v1" }], nextPageToken: undefined });
    enrichVideoIds.mockImplementation(async (_deps, _params, progress) => {
      progress.savedVideos.push({ id: "internal-v1", youtubeVideoId: "v1" });
    });
    scrapeRecommendedForSeeds.mockResolvedValue({ seedsProcessed: 1, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    await processor(makeJob());

    expect(enrichVideoIds).toHaveBeenCalledWith(
      deps,
      expect.objectContaining({ source: "keyword_search", discoveryQueryId: null }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("caps the seeds passed to scrapeRecommendedForSeeds at MAX_SEEDS_PER_RUN", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const items = Array.from({ length: 25 }, (_, i) => ({ videoId: `v${i}` }));
    const search = vi.fn().mockResolvedValue({ items, nextPageToken: undefined });
    enrichVideoIds.mockImplementation(async (_deps, _params, progress) => {
      for (const item of items) {
        progress.savedVideos.push({ id: `internal-${item.videoId}`, youtubeVideoId: item.videoId });
      }
    });
    scrapeRecommendedForSeeds.mockResolvedValue({ seedsProcessed: 20, newVideosEnqueued: 0, knownVideosLinked: 0, seedsFailed: 0 });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);
    await processor(makeJob());

    expect(scrapeRecommendedForSeeds).toHaveBeenCalledWith(deps, expect.any(Array), "run-ks-1");
    const seeds = scrapeRecommendedForSeeds.mock.calls[0][1];
    expect(seeds).toHaveLength(MAX_SEEDS_PER_RUN);
  });

  it("rethrows and marks failed on an unexpected error from youtube.search", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 100 });
    getMarketById.mockResolvedValue(MARKET);
    const search = vi.fn().mockRejectedValue(new Error("network boom"));
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      ai: {} as never,
      aiModel: "unused",
      youtube: { search } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-12T00:00:00Z"),
    };

    const processor = createKeywordSearchProcessor(deps);

    await expect(processor(makeJob())).rejects.toThrow("network boom");
    expect(finishKeywordSearch).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "failed", errorMessage: "Error: network boom" }));
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "failed" }));
  });
});
