import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketById, listAllMarkets, listDiscoveryQueriesWithMarket, sumQuotaUsageByMarket, updateMarketEnabled } from "@yvi/db";
import { MarketsService } from "./markets.service";

vi.mock("@yvi/db", () => ({
  getMarketById: vi.fn(),
  listAllMarkets: vi.fn(),
  listDiscoveryQueriesWithMarket: vi.fn(),
  sumQuotaUsageByMarket: vi.fn(),
  updateMarketEnabled: vi.fn(),
  prisma: {},
}));

describe("MarketsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all markets mapped to the DTO shape", async () => {
    vi.mocked(listAllMarkets).mockResolvedValue([
      { id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true, config: {}, createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    const service = new MarketsService();

    const result = await service.list();

    expect(result).toEqual([{ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true }]);
  });

  it("update() rejects a non-boolean enabled field", async () => {
    const service = new MarketsService();

    await expect(service.update("m1", { enabled: "yes" } as never)).rejects.toThrow(BadRequestException);
    expect(updateMarketEnabled).not.toHaveBeenCalled();
  });

  it("update() throws NotFoundException when the market does not exist", async () => {
    vi.mocked(getMarketById).mockResolvedValue(null);
    const service = new MarketsService();

    await expect(service.update("missing", { enabled: true })).rejects.toThrow(NotFoundException);
    expect(updateMarketEnabled).not.toHaveBeenCalled();
  });

  it("update() persists the enabled flag and returns the updated DTO", async () => {
    vi.mocked(getMarketById).mockResolvedValue({ id: "m1" } as never);
    vi.mocked(updateMarketEnabled).mockResolvedValue({
      id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: false,
    } as never);
    const service = new MarketsService();

    const result = await service.update("m1", { enabled: false });

    expect(updateMarketEnabled).toHaveBeenCalledWith({}, "m1", false);
    expect(result).toEqual({ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: false });
  });

  it("health() throws NotFoundException when the market does not exist", async () => {
    vi.mocked(getMarketById).mockResolvedValue(null);
    const service = new MarketsService();

    await expect(service.health("missing")).rejects.toThrow(NotFoundException);
  });

  it("health() aggregates discovery-query counts, the latest run time, and today's quota usage for the market", async () => {
    vi.mocked(getMarketById).mockResolvedValue({ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true } as never);
    vi.mocked(listDiscoveryQueriesWithMarket).mockResolvedValue([
      { id: "q1", marketId: "m1", enabled: true, lastRunAt: new Date("2026-11-05T00:00:00.000Z") },
      { id: "q2", marketId: "m1", enabled: false, lastRunAt: new Date("2026-11-06T00:00:00.000Z") },
      { id: "q3", marketId: "m2", enabled: true, lastRunAt: new Date("2026-11-07T00:00:00.000Z") },
    ] as never);
    vi.mocked(sumQuotaUsageByMarket).mockResolvedValue([
      { marketId: "m1", totalQuota: 42 },
      { marketId: "m2", totalQuota: 7 },
    ]);
    const service = new MarketsService();

    const result = await service.health("m1");

    expect(result).toEqual({
      market: { id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true },
      discoveryQueryCount: 2,
      enabledDiscoveryQueryCount: 1,
      lastDiscoveryRunAt: "2026-11-06T00:00:00.000Z",
      quotaUsedToday: 42,
    });
  });

  it("health() returns null lastDiscoveryRunAt and 0 quota when there is no data for the market", async () => {
    vi.mocked(getMarketById).mockResolvedValue({ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true } as never);
    vi.mocked(listDiscoveryQueriesWithMarket).mockResolvedValue([]);
    vi.mocked(sumQuotaUsageByMarket).mockResolvedValue([]);
    const service = new MarketsService();

    const result = await service.health("m1");

    expect(result.discoveryQueryCount).toBe(0);
    expect(result.lastDiscoveryRunAt).toBeNull();
    expect(result.quotaUsedToday).toBe(0);
  });
});
