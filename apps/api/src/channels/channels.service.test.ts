import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToWatchlist, getChannelDetail, isWatchlisted, listChannels, removeFromWatchlist } from "@yvi/db";
import { ChannelsService, parseListQuery } from "./channels.service";

vi.mock("@yvi/db", () => ({
  addToWatchlist: vi.fn(),
  getChannelDetail: vi.fn(),
  isWatchlisted: vi.fn(),
  listChannels: vi.fn(),
  removeFromWatchlist: vi.fn(),
  prisma: {},
}));

describe("parseListQuery", () => {
  it("fills in defaults when no query params are given", () => {
    expect(parseListQuery(undefined, undefined, undefined)).toEqual({
      tier: undefined,
      watchlistedOnly: false,
      userId: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("clamps limit to the maximum page size", () => {
    expect(parseListQuery(undefined, "500", undefined)).toEqual({
      tier: undefined,
      watchlistedOnly: false,
      userId: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it("falls back to the default limit for a non-positive or non-numeric value", () => {
    expect(parseListQuery(undefined, "0", undefined).limit).toBe(20);
    expect(parseListQuery(undefined, "not-a-number", undefined).limit).toBe(20);
  });

  it("passes the tier filter through when given", () => {
    expect(parseListQuery("breakout", "5", "10")).toEqual({
      tier: "breakout",
      watchlistedOnly: false,
      userId: undefined,
      limit: 5,
      offset: 10,
    });
  });

  it("sets watchlistedOnly true only when the query param is exactly the string \"true\", and passes the userId through", () => {
    expect(parseListQuery(undefined, undefined, undefined, "true", "user-1")).toEqual({
      tier: undefined,
      watchlistedOnly: true,
      userId: "user-1",
      limit: 20,
      offset: 0,
    });
    expect(parseListQuery(undefined, undefined, undefined, "1", "user-1").watchlistedOnly).toBe(false);
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
        isWatchlisted: true,
      },
    ] as never);
    const service = new ChannelsService();

    const result = await service.list(undefined, undefined, undefined);

    expect(listChannels).toHaveBeenCalledWith(
      {},
      { tier: undefined, watchlistedOnly: false, userId: undefined, limit: 20, offset: 0 },
    );
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
        isWatchlisted: true,
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
        isWatchlisted: false,
      },
    ] as never);
    const service = new ChannelsService();

    const result = await service.list("newcomer", "5", "0");

    expect(listChannels).toHaveBeenCalledWith(
      {},
      { tier: "newcomer", watchlistedOnly: false, userId: undefined, limit: 5, offset: 0 },
    );
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
      isWatchlisted: false,
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
      isWatchlisted: false,
    });
    expect(isWatchlisted).not.toHaveBeenCalled();
  });

  it("includes isWatchlisted computed from the watchlist repository when a userId is given", async () => {
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
      latestScoreBreakdown: null,
      latestScoreDataConfidence: null,
      latestScoreComputedAt: null,
    } as never);
    vi.mocked(isWatchlisted).mockResolvedValue(true);
    const service = new ChannelsService();

    const result = await service.detail("ch1", "user-1");

    expect(isWatchlisted).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "channel", entityId: "ch1" });
    expect(result.isWatchlisted).toBe(true);
  });

  it("star() adds the channel to the watchlist when the channel exists", async () => {
    vi.mocked(getChannelDetail).mockResolvedValue({ id: "ch1" } as never);
    const service = new ChannelsService();

    await service.star("ch1", "user-1");

    expect(addToWatchlist).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "channel", entityId: "ch1" });
  });

  it("star() throws NotFoundException and does not touch the watchlist when the channel does not exist", async () => {
    vi.mocked(getChannelDetail).mockResolvedValue(null);
    const service = new ChannelsService();

    await expect(service.star("missing-channel", "user-1")).rejects.toThrow(NotFoundException);
    expect(addToWatchlist).not.toHaveBeenCalled();
  });

  it("unstar() removes the channel from the watchlist", async () => {
    const service = new ChannelsService();

    await service.unstar("ch1", "user-1");

    expect(removeFromWatchlist).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "channel", entityId: "ch1" });
  });
});
