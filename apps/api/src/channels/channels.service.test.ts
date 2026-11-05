import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getChannelDetail, listChannels } from "@yvi/db";
import { ChannelsService, parseListQuery } from "./channels.service";

vi.mock("@yvi/db", () => ({
  getChannelDetail: vi.fn(),
  listChannels: vi.fn(),
  prisma: {},
}));

describe("parseListQuery", () => {
  it("fills in defaults when no query params are given", () => {
    expect(parseListQuery(undefined, undefined, undefined)).toEqual({ tier: undefined, limit: 20, offset: 0 });
  });

  it("clamps limit to the maximum page size", () => {
    expect(parseListQuery(undefined, "500", undefined)).toEqual({ tier: undefined, limit: 100, offset: 0 });
  });

  it("falls back to the default limit for a non-positive or non-numeric value", () => {
    expect(parseListQuery(undefined, "0", undefined).limit).toBe(20);
    expect(parseListQuery(undefined, "not-a-number", undefined).limit).toBe(20);
  });

  it("passes the tier filter through when given", () => {
    expect(parseListQuery("breakout", "5", "10")).toEqual({ tier: "breakout", limit: 5, offset: 10 });
  });
});

describe("ChannelsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stringifies bigint counts and converts the latest score to a plain list DTO", async () => {
    vi.mocked(listChannels).mockResolvedValue([
      {
        id: "ch1",
        youtubeChannelId: "yt1",
        title: "Channel 1",
        channelTier: "rising",
        currentSubscriberCount: 1_000n,
        currentViewCount: 50_000n,
        currentVideoCount: 10n,
        latestChannelScore: 60.5,
        latestScoreComputedAt: new Date("2026-11-05T12:00:00.000Z"),
      },
    ] as never);
    const service = new ChannelsService();

    const result = await service.list(undefined, undefined, undefined);

    expect(listChannels).toHaveBeenCalledWith({}, { tier: undefined, limit: 20, offset: 0 });
    expect(result).toEqual([
      {
        id: "ch1",
        youtubeChannelId: "yt1",
        title: "Channel 1",
        channelTier: "rising",
        currentSubscriberCount: "1000",
        currentViewCount: "50000",
        currentVideoCount: "10",
        latestChannelScore: 60.5,
        latestScoreComputedAt: "2026-11-05T12:00:00.000Z",
      },
    ]);
  });

  it("passes a null score through for a channel with no ChannelScore row yet", async () => {
    vi.mocked(listChannels).mockResolvedValue([
      {
        id: "ch1",
        youtubeChannelId: "yt1",
        title: "Channel 1",
        channelTier: "newcomer",
        currentSubscriberCount: null,
        currentViewCount: null,
        currentVideoCount: null,
        latestChannelScore: null,
        latestScoreComputedAt: null,
      },
    ] as never);
    const service = new ChannelsService();

    const result = await service.list("newcomer", "5", "0");

    expect(listChannels).toHaveBeenCalledWith({}, { tier: "newcomer", limit: 5, offset: 0 });
    expect(result[0]).toEqual({
      id: "ch1",
      youtubeChannelId: "yt1",
      title: "Channel 1",
      channelTier: "newcomer",
      currentSubscriberCount: null,
      currentViewCount: null,
      currentVideoCount: null,
      latestChannelScore: null,
      latestScoreComputedAt: null,
    });
  });

  it("throws NotFoundException when the channel does not exist", async () => {
    vi.mocked(getChannelDetail).mockResolvedValue(null);
    const service = new ChannelsService();

    await expect(service.detail("missing-channel")).rejects.toThrow(NotFoundException);
  });

  it("maps a found channel's detail row, including its score breakdown", async () => {
    vi.mocked(getChannelDetail).mockResolvedValue({
      id: "ch1",
      youtubeChannelId: "yt1",
      title: "Channel 1",
      description: "desc",
      channelTier: "breakout",
      currentSubscriberCount: 1_000n,
      currentViewCount: 50_000n,
      currentVideoCount: 10n,
      latestChannelScore: 80,
      latestScoreBreakdown: { outlierVideoRatioPercentile: { weight: 0.4, value: 90, contribution: 36 } },
      latestScoreDataConfidence: 0.9,
      latestScoreComputedAt: new Date("2026-11-05T12:00:00.000Z"),
    } as never);
    const service = new ChannelsService();

    const result = await service.detail("ch1");

    expect(result).toEqual({
      id: "ch1",
      youtubeChannelId: "yt1",
      title: "Channel 1",
      description: "desc",
      channelTier: "breakout",
      currentSubscriberCount: "1000",
      currentViewCount: "50000",
      currentVideoCount: "10",
      latestChannelScore: 80,
      latestScoreBreakdown: { outlierVideoRatioPercentile: { weight: 0.4, value: 90, contribution: 36 } },
      latestScoreDataConfidence: 0.9,
      latestScoreComputedAt: "2026-11-05T12:00:00.000Z",
    });
  });
});
