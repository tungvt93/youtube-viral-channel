import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOverviewCounts, listDiscoveryVolumeByDay, listEmergingVideosByMarket, listTopEmergingVideos, listTopRisingTopics } from "@yvi/db";
import { OverviewService, parseDiscoveryVolumeDays, parseTopSignalsLimit } from "./overview.service";
import type { ChannelsService } from "../channels/channels.service";

vi.mock("@yvi/db", () => ({
  getOverviewCounts: vi.fn(),
  listDiscoveryVolumeByDay: vi.fn(),
  listEmergingVideosByMarket: vi.fn(),
  listTopEmergingVideos: vi.fn(),
  listTopRisingTopics: vi.fn(),
  prisma: {},
}));

describe("parseDiscoveryVolumeDays", () => {
  it("defaults to 30", () => {
    expect(parseDiscoveryVolumeDays(undefined)).toBe(30);
  });

  it("clamps to the maximum of 90", () => {
    expect(parseDiscoveryVolumeDays("500")).toBe(90);
  });

  it("falls back to the default for a non-positive or non-numeric value", () => {
    expect(parseDiscoveryVolumeDays("0")).toBe(30);
    expect(parseDiscoveryVolumeDays("not-a-number")).toBe(30);
  });
});

describe("parseTopSignalsLimit", () => {
  it("defaults to 10", () => {
    expect(parseTopSignalsLimit(undefined)).toBe(10);
  });

  it("clamps to the maximum of 50", () => {
    expect(parseTopSignalsLimit("500")).toBe(50);
  });
});

describe("OverviewService", () => {
  let channelsService: { list: ReturnType<typeof vi.fn> };
  let service: OverviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    channelsService = { list: vi.fn().mockResolvedValue([]) };
    service = new OverviewService(channelsService as unknown as ChannelsService);
  });

  it("returns the overview counts as-is", async () => {
    vi.mocked(getOverviewCounts).mockResolvedValue({
      newVideosToday: 3,
      emergingVideosCount: 2,
      breakoutChannelsCount: 1,
      risingTopicsCount: 5,
      activeMarketsCount: 4,
    });

    const result = await service.summary();

    expect(result).toEqual({ newVideosToday: 3, emergingVideosCount: 2, breakoutChannelsCount: 1, risingTopicsCount: 5, activeMarketsCount: 4 });
  });

  it("stringifies discovery-volume-by-day counts and passes the market breakdown through", async () => {
    vi.mocked(listDiscoveryVolumeByDay).mockResolvedValue([{ day: new Date("2026-11-06T00:00:00.000Z"), count: 42n }]);
    vi.mocked(listEmergingVideosByMarket).mockResolvedValue([{ marketId: "m1", marketCode: "US", emergingVideoCount: 0 }]);

    const result = await service.discoveryVolume("7");

    expect(listDiscoveryVolumeByDay).toHaveBeenCalledWith({}, expect.any(Date), 7);
    expect(result).toEqual({
      byDay: [{ day: "2026-11-06T00:00:00.000Z", count: "42" }],
      byMarket: [{ marketId: "m1", marketCode: "US", emergingVideoCount: 0 }],
    });
  });

  it("maps top emerging videos/rising topics and reuses ChannelsService for breakout channels", async () => {
    vi.mocked(listTopEmergingVideos).mockResolvedValue([
      {
        id: "v1",
        youtubeVideoId: "yt1",
        title: "Viral video",
        thumbnailUrl: null,
        channelId: "c1",
        channelTitle: "Channel 1",
        currentViewCount: 1000n,
        latestViralScore: 88.5,
        latestScoreComputedAt: new Date("2026-11-06T00:00:00.000Z"),
      },
    ]);
    vi.mocked(listTopRisingTopics).mockResolvedValue([
      {
        id: "t1",
        slug: "cooking",
        canonicalName: "Cooking",
        latestMarketId: "m1",
        latestMomentumScore: 63.333,
        latestLifecycleState: "trending",
        latestWindowEnd: new Date("2026-11-06T00:00:00.000Z"),
      },
    ]);
    channelsService.list.mockResolvedValue([{ id: "c2", title: "Breakout Channel" }]);

    const result = await service.topSignals("10");

    expect(listTopEmergingVideos).toHaveBeenCalledWith({}, 10);
    expect(listTopRisingTopics).toHaveBeenCalledWith({}, 10);
    expect(channelsService.list).toHaveBeenCalledWith("breakout", "10", "0");
    expect(result).toEqual({
      topEmergingVideos: [
        {
          id: "v1",
          youtubeVideoId: "yt1",
          title: "Viral video",
          thumbnailUrl: null,
          channelId: "c1",
          channelTitle: "Channel 1",
          currentViewCount: "1000",
          latestViralScore: 88.5,
          latestScoreComputedAt: "2026-11-06T00:00:00.000Z",
        },
      ],
      topRisingTopics: [
        {
          id: "t1",
          slug: "cooking",
          canonicalName: "Cooking",
          latestMarketId: "m1",
          latestMomentumScore: 63.333,
          latestLifecycleState: "trending",
          latestWindowEnd: "2026-11-06T00:00:00.000Z",
        },
      ],
      topBreakoutChannels: [{ id: "c2", title: "Breakout Channel" }],
    });
  });
});
