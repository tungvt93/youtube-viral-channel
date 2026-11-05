import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  getLatestTrendSnapshot,
  listObservedTopicVideos,
  listTrendSnapshotsForTopic,
  upsertTrendSnapshot,
} from "./trend-snapshots";

describe("listObservedTopicVideos", () => {
  it("runs the recursive-CTE query with the window bounds as bound parameters", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;
    const windowStart = new Date("2026-10-29T00:00:00Z");
    const windowEnd = new Date("2026-11-05T00:00:00Z");

    await listObservedTopicVideos(db, windowStart, windowEnd);

    expect(queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("WITH RECURSIVE topic_root"), windowStart, windowEnd);
    const [sql] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("de.market_id IS NOT NULL");
    expect(sql).toContain("v.channel_id IS NOT NULL");
  });

  it("returns the raw rows unchanged", async () => {
    const row = {
      marketId: "market-us",
      topicId: "topic-1",
      videoId: "video-1",
      channelId: "channel-1",
      currentViewCount: 1000n,
      publishedAt: new Date("2026-11-01T00:00:00Z"),
    };
    const queryRawUnsafe = vi.fn().mockResolvedValue([row]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    const result = await listObservedTopicVideos(db, new Date(), new Date());

    expect(result).toEqual([row]);
  });
});

describe("upsertTrendSnapshot", () => {
  it("upserts on the (marketId, topicId, windowStart, windowEnd) unique key", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "snapshot-1" });
    const db = { trendSnapshot: { upsert } } as unknown as PrismaClient;
    const windowStart = new Date("2026-10-29T00:00:00Z");
    const windowEnd = new Date("2026-11-05T00:00:00Z");
    const input = {
      marketId: "market-us",
      topicId: "topic-1",
      windowStart,
      windowEnd,
      uniqueVideoCount: 10,
      uniqueChannelCount: 6,
      totalObservedViews: 50_000n,
      medianVph: 120.5,
      p90Vph: 400.2,
      outlierVideoCount: 2,
      momentumScore: 0.73,
      sampleConfidence: 0.6,
      scoreBreakdown: { momentum: 0.73 },
      lifecycleState: "rising",
    };

    await upsertTrendSnapshot(db, input);

    expect(upsert).toHaveBeenCalledWith({
      where: {
        marketId_topicId_windowStart_windowEnd: {
          marketId: "market-us",
          topicId: "topic-1",
          windowStart,
          windowEnd,
        },
      },
      create: {
        marketId: "market-us",
        topicId: "topic-1",
        windowStart,
        windowEnd,
        uniqueVideoCount: 10,
        uniqueChannelCount: 6,
        totalObservedViews: 50_000n,
        medianVph: 120.5,
        p90Vph: 400.2,
        outlierVideoCount: 2,
        momentumScore: 0.73,
        sampleConfidence: 0.6,
        scoreBreakdown: { momentum: 0.73 },
        lifecycleState: "rising",
      },
      update: {
        uniqueVideoCount: 10,
        uniqueChannelCount: 6,
        totalObservedViews: 50_000n,
        medianVph: 120.5,
        p90Vph: 400.2,
        outlierVideoCount: 2,
        momentumScore: 0.73,
        sampleConfidence: 0.6,
        scoreBreakdown: { momentum: 0.73 },
        lifecycleState: "rising",
      },
    });
  });
});

describe("getLatestTrendSnapshot", () => {
  it("finds the most recent snapshot for a (market, topic) pair by windowEnd", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "snapshot-1" });
    const db = { trendSnapshot: { findFirst } } as unknown as PrismaClient;

    await getLatestTrendSnapshot(db, "market-us", "topic-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { marketId: "market-us", topicId: "topic-1" },
      orderBy: { windowEnd: "desc" },
    });
  });
});

describe("listTrendSnapshotsForTopic", () => {
  it("lists snapshots for a topic across all markets, newest window first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { trendSnapshot: { findMany } } as unknown as PrismaClient;

    await listTrendSnapshotsForTopic(db, "topic-1", 30);

    expect(findMany).toHaveBeenCalledWith({
      where: { topicId: "topic-1" },
      orderBy: { windowEnd: "desc" },
      take: 30,
    });
  });
});
