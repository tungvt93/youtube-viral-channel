import { describe, expect, it, vi } from "vitest";
import { TopicsController } from "./topics.controller";
import type { TopicsService } from "./topics.service";

describe("TopicsController", () => {
  it("delegates a list lookup to the service with the raw query params", async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: "t1",
        slug: "cooking",
        canonicalName: "Cooking",
        description: "Cooking content",
        status: "active",
        confidence: 0.8,
        createdBy: "ai",
        createdAt: "2026-11-01T00:00:00.000Z",
        latestMarketId: "m1",
        latestMomentumScore: 63.333,
        latestLifecycleState: "trending",
        latestWindowEnd: "2026-11-06T00:00:00.000Z",
      },
    ]);
    const controller = new TopicsController({ list } as unknown as TopicsService);

    const result = await controller.list("m1", "active", "10", "0");

    expect(list).toHaveBeenCalledWith("m1", "active", "10", "0");
    expect(result).toEqual([
      {
        id: "t1",
        slug: "cooking",
        canonicalName: "Cooking",
        description: "Cooking content",
        status: "active",
        confidence: 0.8,
        createdBy: "ai",
        createdAt: "2026-11-01T00:00:00.000Z",
        latestMarketId: "m1",
        latestMomentumScore: 63.333,
        latestLifecycleState: "trending",
        latestWindowEnd: "2026-11-06T00:00:00.000Z",
      },
    ]);
  });

  it("delegates a trends lookup to the service", async () => {
    const trends = vi.fn().mockResolvedValue([
      {
        id: "snap1",
        marketId: "m1",
        topicId: "t1",
        windowStart: "2026-10-30T00:00:00.000Z",
        windowEnd: "2026-11-06T00:00:00.000Z",
        uniqueVideoCount: 20,
        uniqueChannelCount: 20,
        totalObservedViews: "20000",
        medianVph: 1000,
        p90Vph: 1000,
        outlierVideoCount: 0,
        momentumScore: 63.333,
        sampleConfidence: 1,
        scoreBreakdown: {},
        lifecycleState: "trending",
      },
    ]);
    const controller = new TopicsController({ trends } as unknown as TopicsService);

    const result = await controller.trends("t1", "10");

    expect(trends).toHaveBeenCalledWith("t1", "10");
    expect(result).toEqual([
      {
        id: "snap1",
        marketId: "m1",
        topicId: "t1",
        windowStart: "2026-10-30T00:00:00.000Z",
        windowEnd: "2026-11-06T00:00:00.000Z",
        uniqueVideoCount: 20,
        uniqueChannelCount: 20,
        totalObservedViews: "20000",
        medianVph: 1000,
        p90Vph: 1000,
        outlierVideoCount: 0,
        momentumScore: 63.333,
        sampleConfidence: 1,
        scoreBreakdown: {},
        lifecycleState: "trending",
      },
    ]);
  });
});
