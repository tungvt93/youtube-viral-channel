import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  getOverviewCounts,
  listDiscoveryVolumeByDay,
  listEmergingVideosByMarket,
  listTopEmergingVideos,
  listTopRisingTopics,
} from "./overview";

describe("getOverviewCounts", () => {
  it("counts each card metric against current state, scoping the new-videos count to today (UTC)", async () => {
    const videoCount = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    const channelCount = vi.fn().mockResolvedValue(1);
    const marketCount = vi.fn().mockResolvedValue(4);
    const queryRawUnsafe = vi.fn().mockResolvedValue([{ count: 5n }]);
    const db = {
      video: { count: videoCount },
      channel: { count: channelCount },
      market: { count: marketCount },
      $queryRawUnsafe: queryRawUnsafe,
    } as unknown as PrismaClient;
    const now = new Date("2026-11-06T15:30:00Z");

    const result = await getOverviewCounts(db, now);

    expect(videoCount).toHaveBeenNthCalledWith(1, { where: { firstDiscoveredAt: { gte: new Date("2026-11-06T00:00:00Z") } } });
    expect(videoCount).toHaveBeenNthCalledWith(2, { where: { monitoringState: "high_signal" } });
    expect(channelCount).toHaveBeenCalledWith({ where: { channelTier: "breakout" } });
    expect(marketCount).toHaveBeenCalledWith({ where: { enabled: true } });
    expect(result).toEqual({
      newVideosToday: 3,
      emergingVideosCount: 2,
      breakoutChannelsCount: 1,
      risingTopicsCount: 5,
      activeMarketsCount: 4,
    });
  });
});

describe("listDiscoveryVolumeByDay", () => {
  it("queries the trailing window starting `days - 1` days before today (UTC)", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;
    const now = new Date("2026-11-06T15:30:00Z");

    await listDiscoveryVolumeByDay(db, now, 7);

    const [, windowStart] = queryRawUnsafe.mock.calls[0];
    expect(windowStart).toEqual(new Date("2026-10-31T00:00:00Z"));
  });
});

describe("listEmergingVideosByMarket", () => {
  it("runs a single query over enabled markets", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listEmergingVideosByMarket(db);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe.mock.calls[0][0]).toContain("WHERE m.enabled = true");
  });
});

describe("listTopEmergingVideos", () => {
  it("filters to high_signal videos ordered by latest viral score", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listTopEmergingVideos(db, 10);

    const [sql, limit] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("v.monitoring_state = 'high_signal'");
    expect(limit).toBe(10);
  });
});

describe("listTopRisingTopics", () => {
  it("filters to rising lifecycle states ordered by momentum score", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listTopRisingTopics(db, 10);

    const [sql, limit, states] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("latest.lifecycle_state = ANY($2::text[])");
    expect(limit).toBe(10);
    expect(states).toEqual(["emerging", "accelerating", "trending", "peaking"]);
  });
});
