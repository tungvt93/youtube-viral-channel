import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countFailedCallsToday,
  getDailyBudget,
  listAllMarkets,
  listRecentJobRuns,
  sumQuotaUsageByEndpoint,
  sumQuotaUsageByMarket,
  sumTodayQuotaUsage,
} from "@yvi/db";
import { SystemService } from "./system.service";

vi.mock("@yvi/db", () => ({
  countFailedCallsToday: vi.fn(),
  getDailyBudget: vi.fn(),
  listAllMarkets: vi.fn(),
  listRecentJobRuns: vi.fn(),
  sumQuotaUsageByEndpoint: vi.fn(),
  sumQuotaUsageByMarket: vi.fn(),
  sumTodayQuotaUsage: vi.fn(),
  prisma: {},
}));

describe("SystemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("health", () => {
    it("reports ok when quota usage is low and there are no recent job failures", async () => {
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(1_000);
      vi.mocked(countFailedCallsToday).mockResolvedValue(0);
      vi.mocked(listRecentJobRuns).mockResolvedValue([{ status: "completed" }, { status: "running" }] as never);
      const service = new SystemService();

      const result = await service.health();

      expect(result).toEqual({ status: "ok", quotaPercentUsed: 10, failedCallsToday: 0, recentJobFailures: 0 });
    });

    it("reports degraded when a recent job failed, even with low quota usage", async () => {
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(100);
      vi.mocked(countFailedCallsToday).mockResolvedValue(2);
      vi.mocked(listRecentJobRuns).mockResolvedValue([{ status: "completed" }, { status: "failed" }] as never);
      const service = new SystemService();

      const result = await service.health();

      expect(result.status).toBe("degraded");
      expect(result.recentJobFailures).toBe(1);
      expect(result.failedCallsToday).toBe(2);
    });

    it("reports degraded when quota usage is at or above 95%", async () => {
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(9_500);
      vi.mocked(countFailedCallsToday).mockResolvedValue(0);
      vi.mocked(listRecentJobRuns).mockResolvedValue([] as never);
      const service = new SystemService();

      const result = await service.health();

      expect(result.status).toBe("degraded");
      expect(result.quotaPercentUsed).toBe(95);
    });
  });

  describe("jobs", () => {
    it("maps JobRun rows to the DTO shape with ISO timestamps", async () => {
      vi.mocked(listRecentJobRuns).mockResolvedValue([
        {
          id: "job-1",
          jobName: "discovery-search",
          queue: "discovery-search",
          status: "completed",
          startedAt: new Date("2026-11-06T00:00:00.000Z"),
          finishedAt: new Date("2026-11-06T00:01:00.000Z"),
          durationMs: 60_000,
          resultCount: 12,
          errorMessage: null,
        },
      ] as never);
      const service = new SystemService();

      const result = await service.jobs(undefined);

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 50);
      expect(result).toEqual([
        {
          id: "job-1",
          jobName: "discovery-search",
          queue: "discovery-search",
          status: "completed",
          startedAt: "2026-11-06T00:00:00.000Z",
          finishedAt: "2026-11-06T00:01:00.000Z",
          durationMs: 60_000,
          resultCount: 12,
          errorMessage: null,
        },
      ]);
    });

    it("clamps the limit to the maximum page size", async () => {
      vi.mocked(listRecentJobRuns).mockResolvedValue([]);
      const service = new SystemService();

      await service.jobs("500");

      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 100);
    });

    it("falls back to the default limit for a non-positive or non-numeric value", async () => {
      vi.mocked(listRecentJobRuns).mockResolvedValue([]);
      const service = new SystemService();

      await service.jobs("0");
      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 50);

      await service.jobs("not-a-number");
      expect(listRecentJobRuns).toHaveBeenCalledWith({}, 50);
    });
  });

  describe("quota", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      [0, "ok"],
      [70, "warn"],
      [85, "high"],
      [95, "critical"],
    ])("bands %i%% usage as %s and includes remainingBudget", async (percent, band) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      const usedToday = (percent / 100) * 10_000;
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(usedToday);
      const service = new SystemService();

      const result = await service.quota();

      expect(result.budget).toBe(10_000);
      expect(result.usedToday).toBe(usedToday);
      expect(result.percentUsed).toBe(percent);
      expect(result.band).toBe(band);
      expect(result.remainingBudget).toBe(10_000 - usedToday);
    });

    it("projects end-of-day usage by linear extrapolation from the elapsed fraction of the UTC day", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(1_000);
      const service = new SystemService();

      const result = await service.quota();

      expect(result.projectedEndOfDay).toBe(2_000);
    });

    it("returns usedToday unprojected within the first few minutes of the UTC day", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-06T00:01:00.000Z"));
      vi.mocked(getDailyBudget).mockResolvedValue(10_000);
      vi.mocked(sumTodayQuotaUsage).mockResolvedValue(50);
      const service = new SystemService();

      const result = await service.quota();

      expect(result.projectedEndOfDay).toBe(50);
    });
  });

  describe("apiUsage", () => {
    it("resolves market codes for the by-market breakdown and passes the by-endpoint breakdown through", async () => {
      vi.mocked(sumQuotaUsageByEndpoint).mockResolvedValue([{ endpoint: "videos.list", totalQuota: 100 }]);
      vi.mocked(sumQuotaUsageByMarket).mockResolvedValue([
        { marketId: "m1", totalQuota: 80 },
        { marketId: null, totalQuota: 20 },
      ]);
      vi.mocked(listAllMarkets).mockResolvedValue([{ id: "m1", code: "US" }] as never);
      const service = new SystemService();

      const result = await service.apiUsage();

      expect(result).toEqual({
        byEndpoint: [{ endpoint: "videos.list", totalQuota: 100 }],
        byMarket: [
          { marketId: "m1", marketCode: "US", totalQuota: 80 },
          { marketId: null, marketCode: null, totalQuota: 20 },
        ],
      });
    });

    it("falls back to a null market code when the market no longer exists", async () => {
      vi.mocked(sumQuotaUsageByEndpoint).mockResolvedValue([]);
      vi.mocked(sumQuotaUsageByMarket).mockResolvedValue([{ marketId: "deleted-market", totalQuota: 5 }]);
      vi.mocked(listAllMarkets).mockResolvedValue([]);
      const service = new SystemService();

      const result = await service.apiUsage();

      expect(result.byMarket).toEqual([{ marketId: "deleted-market", marketCode: null, totalQuota: 5 }]);
    });
  });
});
