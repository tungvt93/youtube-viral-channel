import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTopicById, listTopics, listTrendSnapshotsForTopic } from "@yvi/db";
import { parseListQuery, parseTrendsLimit, TopicsService } from "./topics.service";

vi.mock("@yvi/db", () => ({
  getTopicById: vi.fn(),
  listTopics: vi.fn(),
  listTrendSnapshotsForTopic: vi.fn(),
  prisma: {},
}));

describe("parseListQuery", () => {
  it("fills in defaults when no query params are given", () => {
    expect(parseListQuery(undefined, undefined, undefined, undefined)).toEqual({ marketId: undefined, status: undefined, limit: 20, offset: 0 });
  });

  it("clamps limit to the maximum page size", () => {
    expect(parseListQuery(undefined, undefined, "500", undefined)).toEqual({ marketId: undefined, status: undefined, limit: 100, offset: 0 });
  });

  it("falls back to the default limit for a non-positive or non-numeric value", () => {
    expect(parseListQuery(undefined, undefined, "0", undefined).limit).toBe(20);
    expect(parseListQuery(undefined, undefined, "not-a-number", undefined).limit).toBe(20);
  });

  it("passes the market and status filters through when given", () => {
    expect(parseListQuery("m1", "active", "5", "10")).toEqual({ marketId: "m1", status: "active", limit: 5, offset: 10 });
  });
});

describe("parseTrendsLimit", () => {
  it("defaults to 30", () => {
    expect(parseTrendsLimit(undefined)).toBe(30);
  });

  it("clamps to the maximum of 100", () => {
    expect(parseTrendsLimit("500")).toBe(100);
  });

  it("falls back to the default for a non-positive or non-numeric value", () => {
    expect(parseTrendsLimit("0")).toBe(30);
    expect(parseTrendsLimit("not-a-number")).toBe(30);
  });
});

describe("TopicsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts a listTopics row into a list DTO with ISO timestamps and numeric scores", async () => {
    vi.mocked(listTopics).mockResolvedValue([
      {
        id: "t1",
        slug: "cooking",
        canonicalName: "Cooking",
        description: "Cooking content",
        status: "active",
        confidence: 0.8,
        createdBy: "ai",
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        latestMarketId: "m1",
        latestMomentumScore: 63.333,
        latestLifecycleState: "trending",
        latestWindowEnd: new Date("2026-11-06T00:00:00.000Z"),
      },
    ] as never);
    const service = new TopicsService();

    const result = await service.list(undefined, undefined, undefined, undefined);

    expect(listTopics).toHaveBeenCalledWith({}, { marketId: undefined, status: undefined, limit: 20, offset: 0 });
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

  it("passes null trend fields through for a topic with no snapshot yet", async () => {
    vi.mocked(listTopics).mockResolvedValue([
      {
        id: "t1",
        slug: "cooking",
        canonicalName: "Cooking",
        description: "Cooking content",
        status: "candidate",
        confidence: 0.5,
        createdBy: "ai",
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        latestMarketId: null,
        latestMomentumScore: null,
        latestLifecycleState: null,
        latestWindowEnd: null,
      },
    ] as never);
    const service = new TopicsService();

    const result = await service.list("m1", "candidate", "5", "0");

    expect(listTopics).toHaveBeenCalledWith({}, { marketId: "m1", status: "candidate", limit: 5, offset: 0 });
    expect(result[0]).toEqual({
      id: "t1",
      slug: "cooking",
      canonicalName: "Cooking",
      description: "Cooking content",
      status: "candidate",
      confidence: 0.5,
      createdBy: "ai",
      createdAt: "2026-11-01T00:00:00.000Z",
      latestMarketId: null,
      latestMomentumScore: null,
      latestLifecycleState: null,
      latestWindowEnd: null,
    });
  });

  it("throws NotFoundException when the topic does not exist", async () => {
    vi.mocked(getTopicById).mockResolvedValue(null);
    const service = new TopicsService();

    await expect(service.trends("missing-topic", undefined)).rejects.toThrow(NotFoundException);
    expect(listTrendSnapshotsForTopic).not.toHaveBeenCalled();
  });

  it("maps a topic's trend snapshots, stringifying the bigint view count", async () => {
    vi.mocked(getTopicById).mockResolvedValue({ id: "t1" } as never);
    vi.mocked(listTrendSnapshotsForTopic).mockResolvedValue([
      {
        id: "snap1",
        marketId: "m1",
        topicId: "t1",
        windowStart: new Date("2026-10-30T00:00:00.000Z"),
        windowEnd: new Date("2026-11-06T00:00:00.000Z"),
        uniqueVideoCount: 20,
        uniqueChannelCount: 20,
        totalObservedViews: 20_000n,
        medianVph: 1000,
        p90Vph: 1000,
        outlierVideoCount: 0,
        momentumScore: 63.333,
        sampleConfidence: 1,
        scoreBreakdown: { viewVelocityPercentile: { weight: 0.3, value: 75, contribution: 22.5 } },
        lifecycleState: "trending",
      },
    ] as never);
    const service = new TopicsService();

    const result = await service.trends("t1", "10");

    expect(listTrendSnapshotsForTopic).toHaveBeenCalledWith({}, "t1", 10);
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
        scoreBreakdown: { viewVelocityPercentile: { weight: 0.3, value: 75, contribution: 22.5 } },
        lifecycleState: "trending",
      },
    ]);
  });
});
