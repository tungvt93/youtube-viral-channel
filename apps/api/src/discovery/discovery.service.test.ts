import { describe, expect, it, vi } from "vitest";

const { getDiscoveryQueryById, getJobRunById, startJobRun } = vi.hoisted(() => ({
  getDiscoveryQueryById: vi.fn(),
  getJobRunById: vi.fn(),
  startJobRun: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  prisma: {},
  getDiscoveryQueryById,
  getJobRunById,
  startJobRun,
}));

import { DiscoveryService } from "./discovery.service";

function makeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
}

describe("DiscoveryService", () => {
  it("routes a most_popular query to discovery-regional with a date-bucketed idempotency key", async () => {
    getDiscoveryQueryById.mockResolvedValue({
      id: "q1",
      query: "funny pets",
      strategy: "most_popular",
      market: { code: "US" },
    });
    startJobRun.mockResolvedValue({ id: "discovery:most_popular:US:funny pets:" });
    const discoveryRegional = makeQueue();
    const discoverySearch = makeQueue();
    const service = new DiscoveryService({ discoveryRegional: discoveryRegional as never, discoverySearch: discoverySearch as never });

    const result = await service.triggerRun("q1");

    expect(result.jobId).toMatch(/^discovery:most_popular:US:funny pets:\d{4}-\d{2}-\d{2}$/);
    expect(discoveryRegional.add).toHaveBeenCalledTimes(1);
    expect(discoverySearch.add).not.toHaveBeenCalled();
    expect(startJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: result.jobId }));
  });

  it("routes a recent_search query to discovery-search", async () => {
    getDiscoveryQueryById.mockResolvedValue({
      id: "q2",
      query: "gaming highlights",
      strategy: "recent_search",
      market: { code: "DE" },
    });
    startJobRun.mockResolvedValue({ id: "discovery:recent_search:DE:gaming highlights:" });
    const discoveryRegional = makeQueue();
    const discoverySearch = makeQueue();
    const service = new DiscoveryService({ discoveryRegional: discoveryRegional as never, discoverySearch: discoverySearch as never });

    await service.triggerRun("q2");

    expect(discoverySearch.add).toHaveBeenCalledTimes(1);
    expect(discoveryRegional.add).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the discovery query does not exist", async () => {
    getDiscoveryQueryById.mockResolvedValue(null);
    const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

    await expect(service.triggerRun("missing")).rejects.toThrow();
  });

  it("returns the JobRun for a known job id", async () => {
    getJobRunById.mockResolvedValue({ id: "job-1", status: "completed" });
    const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

    const result = await service.getJobStatus("job-1");

    expect(result).toEqual({ id: "job-1", status: "completed" });
  });

  it("throws NotFoundException when the job id does not exist", async () => {
    getJobRunById.mockResolvedValue(null);
    const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

    await expect(service.getJobStatus("missing")).rejects.toThrow();
  });
});
