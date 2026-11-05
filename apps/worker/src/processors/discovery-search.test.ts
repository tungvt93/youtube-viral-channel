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

import { createDiscoverySearchProcessor } from "./discovery-search";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<DiscoveryJobData> {
  return { id: "job-2", name: "discovery-search", data: { discoveryQueryId: "dq-2" } } as unknown as Job<DiscoveryJobData>;
}

describe("createDiscoverySearchProcessor", () => {
  it("defaults videoDuration=short and enqueues a batched video-enrichment job", async () => {
    startJobRun.mockResolvedValue({ id: "job-2" });
    getDiscoveryQueryById.mockResolvedValue({
      id: "dq-2",
      enabled: true,
      maxPagesPerRun: 1,
      query: "gaming highlights",
      language: "en",
      config: {},
      market: { id: "market-1", code: "US", enabled: true },
    });
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9900, projectedUsage: 100 });
    const logger = makeLogger();
    const search = vi.fn().mockResolvedValue({ items: [{ videoId: "v1" }], nextPageToken: undefined });
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, youtube: { search } as never, queues, logger: logger as never, now: () => new Date("2026-11-05T00:00:00Z") };

    const processor = createDiscoverySearchProcessor(deps);
    const result = await processor(makeJob());

    expect(result).toEqual({ discovered: 1 });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ videoDuration: "short", order: "date", q: "gaming highlights" }));
    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      queues.videoEnrichment,
      "video-enrichment",
      expect.objectContaining({ source: "search" }),
      "job-2:enrich:0",
    );
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "job-2", status: "completed", resultCount: 1 }));
  });

  it("propagates a search failure and marks the JobRun failed", async () => {
    startJobRun.mockResolvedValue({ id: "job-2" });
    getDiscoveryQueryById.mockResolvedValue({
      id: "dq-2",
      enabled: true,
      maxPagesPerRun: 1,
      query: "gaming highlights",
      language: "en",
      config: {},
      market: { id: "market-1", code: "US", enabled: true },
    });
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9900, projectedUsage: 100 });
    const logger = makeLogger();
    const search = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = { db: {} as never, youtube: { search } as never, queues: {} as never, logger: logger as never };

    const processor = createDiscoverySearchProcessor(deps);

    await expect(processor(makeJob())).rejects.toThrow("boom");
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "job-2", status: "failed" }));
  });
});
