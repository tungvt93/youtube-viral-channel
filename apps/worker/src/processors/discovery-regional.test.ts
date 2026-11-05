import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { DiscoveryJobData } from "@yvi/shared";
import type { Queues } from "../queues/index";

const { getDiscoveryQueryById, startJobRun, finishJobRun, recordApiUsage, touchDiscoveryQueryLastRunAt } = vi.hoisted(() => ({
  getDiscoveryQueryById: vi.fn(),
  startJobRun: vi.fn(),
  finishJobRun: vi.fn(),
  recordApiUsage: vi.fn(),
  touchDiscoveryQueryLastRunAt: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  getDiscoveryQueryById,
  startJobRun,
  finishJobRun,
  recordApiUsage,
  touchDiscoveryQueryLastRunAt,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../job-helpers", () => ({ enqueueWithJobRun }));

import { createDiscoveryRegionalProcessor } from "./discovery-regional";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<DiscoveryJobData> {
  return { id: "job-1", name: "discovery-regional", data: { discoveryQueryId: "dq-1" } } as unknown as Job<DiscoveryJobData>;
}

describe("createDiscoveryRegionalProcessor", () => {
  it("enqueues a batched video-enrichment job per page and completes the JobRun", async () => {
    startJobRun.mockResolvedValue({ id: "job-1" });
    getDiscoveryQueryById.mockResolvedValue({
      id: "dq-1",
      enabled: true,
      maxPagesPerRun: 1,
      query: "funny pets",
      config: {},
      market: { id: "market-1", code: "US", enabled: true },
    });
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9900, projectedUsage: 100 });
    const logger = makeLogger();
    const youtube = {
      listMostPopularVideos: vi.fn().mockResolvedValue({
        items: [{ videoId: "v1" }, { videoId: "v2" }],
        nextPageToken: undefined,
      }),
    };
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, youtube: youtube as never, queues, logger: logger as never, now: () => new Date("2026-11-05T00:00:00Z") };

    const processor = createDiscoveryRegionalProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ discovered: 2 });
    expect(enqueueWithJobRun).toHaveBeenCalledTimes(1);
    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      queues.videoEnrichment,
      "video-enrichment",
      expect.objectContaining({ source: "most_popular", items: [{ videoId: "v1", sourceRank: 0 }, { videoId: "v2", sourceRank: 1 }] }),
      "job-1:enrich:0",
    );
    expect(touchDiscoveryQueryLastRunAt).toHaveBeenCalledWith(deps.db, "dq-1", expect.any(Date));
    expect(finishJobRun).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ id: "job-1", status: "completed", resultCount: 2 }),
    );
  });

  it("fails the JobRun without calling the API when the quota guard blocks the run", async () => {
    startJobRun.mockResolvedValue({ id: "job-1" });
    getDiscoveryQueryById.mockResolvedValue({
      id: "dq-1",
      enabled: true,
      maxPagesPerRun: 1,
      query: "funny pets",
      config: {},
      market: { id: "market-1", code: "US", enabled: true },
    });
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    const logger = makeLogger();
    const youtube = { listMostPopularVideos: vi.fn() };
    const deps = { db: {} as never, youtube: youtube as never, queues: {} as never, logger: logger as never };

    const processor = createDiscoveryRegionalProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ discovered: 0 });
    expect(youtube.listMostPopularVideos).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "job-1", status: "failed" }));
  });

  it("fails the JobRun when the discovery query is disabled", async () => {
    startJobRun.mockResolvedValue({ id: "job-1" });
    getDiscoveryQueryById.mockResolvedValue({
      id: "dq-1",
      enabled: false,
      maxPagesPerRun: 1,
      query: "funny pets",
      config: {},
      market: { id: "market-1", code: "US", enabled: true },
    });
    const logger = makeLogger();
    const deps = { db: {} as never, youtube: {} as never, queues: {} as never, logger: logger as never };

    const processor = createDiscoveryRegionalProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ discovered: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "job-1", status: "failed" }));
  });
});
