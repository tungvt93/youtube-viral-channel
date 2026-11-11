import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { countFailedCallsToday, sumQuotaUsageByEndpoint, sumQuotaUsageByMarket, sumTodayQuotaUsage } from "./api-usage";

describe("sumTodayQuotaUsage", () => {
  it("sums quota_estimate within the UTC day window and defaults to 0", async () => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { quotaEstimate: null } });
    const db = { apiUsageLog: { aggregate } } as unknown as PrismaClient;

    const result = await sumTodayQuotaUsage(db, new Date("2026-11-05T15:30:00Z"));

    expect(result).toBe(0);
    expect(aggregate).toHaveBeenCalledWith({
      _sum: { quotaEstimate: true },
      where: {
        requestTime: {
          gte: new Date("2026-11-05T00:00:00Z"),
          lt: new Date("2026-11-06T00:00:00Z"),
        },
      },
    });
  });

  it("returns the summed value when rows exist", async () => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { quotaEstimate: 1234 } });
    const db = { apiUsageLog: { aggregate } } as unknown as PrismaClient;

    await expect(sumTodayQuotaUsage(db, new Date("2026-11-05T00:00:00Z"))).resolves.toBe(1234);
  });
});

describe("sumQuotaUsageByEndpoint", () => {
  it("groups today's quota usage by endpoint within the UTC day window", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { endpoint: "videos.list", _sum: { quotaEstimate: 100 } },
      { endpoint: "search.list", _sum: { quotaEstimate: null } },
    ]);
    const db = { apiUsageLog: { groupBy } } as unknown as PrismaClient;

    const result = await sumQuotaUsageByEndpoint(db, new Date("2026-11-05T15:30:00Z"));

    expect(groupBy).toHaveBeenCalledWith({
      by: ["endpoint"],
      where: {
        requestTime: {
          gte: new Date("2026-11-05T00:00:00Z"),
          lt: new Date("2026-11-06T00:00:00Z"),
        },
      },
      _sum: { quotaEstimate: true },
    });
    expect(result).toEqual([
      { endpoint: "videos.list", totalQuota: 100 },
      { endpoint: "search.list", totalQuota: 0 },
    ]);
  });
});

describe("sumQuotaUsageByMarket", () => {
  it("groups today's quota usage by market within the UTC day window", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { marketId: "market-1", _sum: { quotaEstimate: 50 } },
      { marketId: null, _sum: { quotaEstimate: null } },
    ]);
    const db = { apiUsageLog: { groupBy } } as unknown as PrismaClient;

    const result = await sumQuotaUsageByMarket(db, new Date("2026-11-05T15:30:00Z"));

    expect(groupBy).toHaveBeenCalledWith({
      by: ["marketId"],
      where: {
        requestTime: {
          gte: new Date("2026-11-05T00:00:00Z"),
          lt: new Date("2026-11-06T00:00:00Z"),
        },
      },
      _sum: { quotaEstimate: true },
    });
    expect(result).toEqual([
      { marketId: "market-1", totalQuota: 50 },
      { marketId: null, totalQuota: 0 },
    ]);
  });
});

describe("countFailedCallsToday", () => {
  it("counts only status=error rows within the UTC day window", async () => {
    const count = vi.fn().mockResolvedValue(3);
    const db = { apiUsageLog: { count } } as unknown as PrismaClient;

    const result = await countFailedCallsToday(db, new Date("2026-11-05T15:30:00Z"));

    expect(count).toHaveBeenCalledWith({
      where: {
        requestTime: {
          gte: new Date("2026-11-05T00:00:00Z"),
          lt: new Date("2026-11-06T00:00:00Z"),
        },
        status: "error",
      },
    });
    expect(result).toBe(3);
  });
});
