import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { sumTodayQuotaUsage } from "./api-usage";

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
