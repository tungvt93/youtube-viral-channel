import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createDiscoveryQuery, getDiscoveryQueryById, getJobRunById, listDiscoveryQueriesWithMarket, listRecentJobRuns, startJobRun, updateDiscoveryQuery } = vi.hoisted(() => ({
  createDiscoveryQuery: vi.fn(),
  getDiscoveryQueryById: vi.fn(),
  getJobRunById: vi.fn(),
  listDiscoveryQueriesWithMarket: vi.fn(),
  listRecentJobRuns: vi.fn(),
  startJobRun: vi.fn(),
  updateDiscoveryQuery: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  prisma: {},
  createDiscoveryQuery,
  getDiscoveryQueryById,
  getJobRunById,
  listDiscoveryQueriesWithMarket,
  listRecentJobRuns,
  startJobRun,
  updateDiscoveryQuery,
}));

import { DiscoveryService } from "./discovery.service";

function makeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DiscoveryService", () => {
  it("routes a most_popular query to discovery-regional with a date-bucketed idempotency key", async () => {
    getDiscoveryQueryById.mockResolvedValue({
      id: "q1",
      query: "funny pets",
      strategy: "most_popular",
      market: { code: "US" },
    });
    startJobRun.mockResolvedValue({ id: "discovery_most_popular_US_funny pets_" });
    const discoveryRegional = makeQueue();
    const discoverySearch = makeQueue();
    const service = new DiscoveryService({ discoveryRegional: discoveryRegional as never, discoverySearch: discoverySearch as never });

    const result = await service.triggerRun("q1");

    expect(result.jobId).toMatch(/^discovery_most_popular_US_funny pets_\d{4}-\d{2}-\d{2}$/);
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
    startJobRun.mockResolvedValue({ id: "discovery_recent_search_DE_gaming highlights_" });
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

  describe("listQueries", () => {
    it("delegates to listDiscoveryQueriesWithMarket and maps rows to DTOs", async () => {
      listDiscoveryQueriesWithMarket.mockResolvedValue([
        {
          id: "q1",
          marketId: "m1",
          market: { code: "US" },
          topicId: null,
          query: "funny pets",
          language: "en",
          strategy: "most_popular",
          priority: 1,
          maxPagesPerRun: 2,
          frequencyMinutes: 60,
          enabled: true,
          lastRunAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      ]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      const result = await service.listQueries();

      expect(result).toEqual([
        {
          id: "q1",
          marketId: "m1",
          marketCode: "US",
          topicId: null,
          query: "funny pets",
          language: "en",
          strategy: "most_popular",
          priority: 1,
          maxPagesPerRun: 2,
          frequencyMinutes: 60,
          enabled: true,
          lastRunAt: "2026-11-01T00:00:00.000Z",
        },
      ]);
    });

    it("maps a null lastRunAt to null", async () => {
      listDiscoveryQueriesWithMarket.mockResolvedValue([
        {
          id: "q2",
          marketId: "m1",
          market: { code: "US" },
          topicId: null,
          query: "gaming",
          language: "en",
          strategy: "recent_search",
          priority: 1,
          maxPagesPerRun: 1,
          frequencyMinutes: 30,
          enabled: false,
          lastRunAt: null,
        },
      ]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      const [result] = await service.listQueries();

      expect(result.lastRunAt).toBeNull();
    });
  });

  describe("createQuery", () => {
    function makeService() {
      return new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });
    }

    it("creates a discovery query with defaults for topicId and enabled when omitted", async () => {
      createDiscoveryQuery.mockResolvedValue({
        id: "q3",
        marketId: "m1",
        market: { code: "US" },
        topicId: null,
        query: "funny pets",
        language: "en",
        strategy: "most_popular",
        priority: 1,
        maxPagesPerRun: 2,
        frequencyMinutes: 60,
        enabled: true,
        lastRunAt: null,
      });
      const service = makeService();

      const result = await service.createQuery({
        marketId: "m1",
        query: "funny pets",
        language: "en",
        strategy: "most_popular",
        priority: 1,
        maxPagesPerRun: 2,
        frequencyMinutes: 60,
      });

      expect(createDiscoveryQuery).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ marketId: "m1", topicId: null, enabled: true }),
      );
      expect(result.id).toBe("q3");
    });

    it("passes through an explicit topicId and enabled=false", async () => {
      createDiscoveryQuery.mockResolvedValue({
        id: "q4",
        marketId: "m1",
        market: { code: "US" },
        topicId: "t1",
        query: "funny pets",
        language: "en",
        strategy: "most_popular",
        priority: 1,
        maxPagesPerRun: 2,
        frequencyMinutes: 60,
        enabled: false,
        lastRunAt: null,
      });
      const service = makeService();

      await service.createQuery({
        marketId: "m1",
        topicId: "t1",
        query: "funny pets",
        language: "en",
        strategy: "most_popular",
        priority: 1,
        maxPagesPerRun: 2,
        frequencyMinutes: 60,
        enabled: false,
      });

      expect(createDiscoveryQuery).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ topicId: "t1", enabled: false }),
      );
    });

    it.each([
      ["marketId", { query: "q", language: "en", strategy: "most_popular", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 1 }],
      ["query", { marketId: "m1", language: "en", strategy: "most_popular", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 1 }],
      ["language", { marketId: "m1", query: "q", strategy: "most_popular", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 1 }],
      ["strategy", { marketId: "m1", query: "q", language: "en", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 1 }],
    ])("throws BadRequestException when %s is missing", async (_field, body) => {
      const service = makeService();

      await expect(service.createQuery(body)).rejects.toThrow(BadRequestException);
      expect(createDiscoveryQuery).not.toHaveBeenCalled();
    });

    it.each(["priority", "maxPagesPerRun", "frequencyMinutes"])("throws BadRequestException when %s is not a number", async (field) => {
      const service = makeService();
      const base = { marketId: "m1", query: "q", language: "en", strategy: "most_popular", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 1 } as Record<string, unknown>;
      base[field] = "not-a-number";

      await expect(service.createQuery(base)).rejects.toThrow(BadRequestException);
      expect(createDiscoveryQuery).not.toHaveBeenCalled();
    });
  });

  describe("updateQuery", () => {
    it("updates only the typed fields after confirming the query exists", async () => {
      getDiscoveryQueryById.mockResolvedValue({ id: "q1", marketId: "m1" });
      updateDiscoveryQuery.mockResolvedValue({
        id: "q1",
        marketId: "m1",
        market: { code: "US" },
        topicId: null,
        query: "updated",
        language: "en",
        strategy: "most_popular",
        priority: 2,
        maxPagesPerRun: 3,
        frequencyMinutes: 90,
        enabled: false,
        lastRunAt: null,
      });
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      const result = await service.updateQuery("q1", { query: "updated", priority: 2, maxPagesPerRun: 3, frequencyMinutes: 90, enabled: false });

      expect(getDiscoveryQueryById).toHaveBeenCalledWith({}, "q1");
      expect(updateDiscoveryQuery).toHaveBeenCalledWith({}, "q1", { query: "updated", priority: 2, maxPagesPerRun: 3, frequencyMinutes: 90, enabled: false });
      expect(result.query).toBe("updated");
    });

    it("throws NotFoundException when the query does not exist", async () => {
      getDiscoveryQueryById.mockResolvedValue(null);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      await expect(service.updateQuery("missing", { priority: 2 })).rejects.toThrow(NotFoundException);
      expect(updateDiscoveryQuery).not.toHaveBeenCalled();
    });
  });

  describe("listJobs", () => {
    it("uses the default limit when none is given", async () => {
      listRecentJobRuns.mockResolvedValue([]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      await service.listJobs(undefined);

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 50);
    });

    it("clamps a limit above the maximum down to 100", async () => {
      listRecentJobRuns.mockResolvedValue([]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      await service.listJobs("500");

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 100);
    });

    it("falls back to the default when the limit is not a valid positive number", async () => {
      listRecentJobRuns.mockResolvedValue([]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      await service.listJobs("not-a-number");

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 50);
    });

    it("passes through a valid limit within bounds", async () => {
      listRecentJobRuns.mockResolvedValue([]);
      const service = new DiscoveryService({ discoveryRegional: makeQueue() as never, discoverySearch: makeQueue() as never });

      await service.listJobs("10");

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 10);
    });
  });
});
