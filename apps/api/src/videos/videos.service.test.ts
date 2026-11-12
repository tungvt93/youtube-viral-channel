import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToWatchlist, countVideos, getVideoById, getVideoDetail, isWatchlisted, listVideoScores, listVideoSnapshots, listVideos, removeFromWatchlist } from "@yvi/db";
import { parseListQuery, VideosService } from "./videos.service";

vi.mock("@yvi/db", () => ({
  addToWatchlist: vi.fn(),
  countVideos: vi.fn(),
  getVideoById: vi.fn(),
  getVideoDetail: vi.fn(),
  isWatchlisted: vi.fn(),
  listVideoScores: vi.fn(),
  listVideoSnapshots: vi.fn(),
  listVideos: vi.fn(),
  removeFromWatchlist: vi.fn(),
  prisma: {},
}));

describe("parseListQuery", () => {
  it("fills in defaults when no query params are given", () => {
    expect(parseListQuery({}, undefined, undefined)).toEqual({
      marketId: undefined,
      format: undefined,
      lifecycle: undefined,
      topicId: undefined,
      discoveryQueryId: undefined,
      channelTier: undefined,
      minViews: undefined,
      minScore: undefined,
      watchlistedOnly: false,
      userId: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("clamps limit to the maximum page size", () => {
    expect(parseListQuery({}, "500", undefined).limit).toBe(100);
  });

  it("falls back to the default limit for a non-positive or non-numeric value", () => {
    expect(parseListQuery({}, "0", undefined).limit).toBe(20);
    expect(parseListQuery({}, "not-a-number", undefined).limit).toBe(20);
  });

  it("parses minViews as a bigint and minScore as a number when given", () => {
    const filter = parseListQuery({ minViews: "1000", minScore: "50.5" }, undefined, undefined);
    expect(filter.minViews).toBe(1000n);
    expect(filter.minScore).toBe(50.5);
  });

  it("leaves minViews/minScore undefined when omitted or empty", () => {
    const filter = parseListQuery({ minViews: "", minScore: "" }, undefined, undefined);
    expect(filter.minViews).toBeUndefined();
    expect(filter.minScore).toBeUndefined();
  });

  it("passes the other filters through when given", () => {
    const filter = parseListQuery(
      {
        marketId: "market-1",
        format: "shorts",
        lifecycle: "monitoring",
        topicId: "topic-1",
        discoveryQueryId: "query-1",
        keywordSearchId: "search-1",
        channelTier: "breakout",
      },
      "5",
      "10",
    );
    expect(filter).toEqual({
      marketId: "market-1",
      format: "shorts",
      lifecycle: "monitoring",
      topicId: "topic-1",
      discoveryQueryId: "query-1",
      keywordSearchId: "search-1",
      channelTier: "breakout",
      minViews: undefined,
      minScore: undefined,
      watchlistedOnly: false,
      userId: undefined,
      limit: 5,
      offset: 10,
    });
  });

  it("sets watchlistedOnly true only when the query param is exactly the string \"true\", and passes the userId through", () => {
    expect(parseListQuery({ watchlistedOnly: "true" }, undefined, undefined, "user-1")).toMatchObject({
      watchlistedOnly: true,
      userId: "user-1",
    });
    expect(parseListQuery({ watchlistedOnly: "1" }, undefined, undefined, "user-1")).toMatchObject({
      watchlistedOnly: false,
    });
  });
});

describe("VideosService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stringifies bigint counts and converts the latest score to a plain list DTO", async () => {
    vi.mocked(listVideos).mockResolvedValue([
      {
        id: "video-1",
        youtubeVideoId: "abc123",
        title: "Title",
        thumbnailUrl: "https://example.com/thumb.jpg",
        channelId: "channel-1",
        channelTitle: "Channel 1",
        marketId: "market-1",
        marketCode: "US",
        publishedAt: new Date("2026-11-01T00:00:00.000Z"),
        currentViewCount: 1_234_567_890_123n,
        formatClassification: "short_candidate",
        monitoringState: "monitoring",
        latestViralScore: 72.5,
        latestScoreComputedAt: new Date("2026-11-05T12:00:00.000Z"),
        lastSnapshotAt: new Date("2026-11-05T06:00:00.000Z"),
        isWatchlisted: true,
      },
    ] as never);
    vi.mocked(countVideos).mockResolvedValue(1);
    const service = new VideosService();

    const result = await service.list({}, undefined, undefined);

    expect(listVideos).toHaveBeenCalledWith(
      {},
      {
        marketId: undefined,
        format: undefined,
        lifecycle: undefined,
        topicId: undefined,
        discoveryQueryId: undefined,
        channelTier: undefined,
        minViews: undefined,
        minScore: undefined,
        watchlistedOnly: false,
        userId: undefined,
        limit: 20,
        offset: 0,
      },
    );
    expect(countVideos).toHaveBeenCalledWith(
      {},
      {
        marketId: undefined,
        format: undefined,
        lifecycle: undefined,
        topicId: undefined,
        discoveryQueryId: undefined,
        channelTier: undefined,
        minViews: undefined,
        minScore: undefined,
        watchlistedOnly: false,
        userId: undefined,
      },
    );
    expect(result).toEqual({
      items: [
        {
          id: "video-1",
          youtubeVideoId: "abc123",
          title: "Title",
          thumbnailUrl: "https://example.com/thumb.jpg",
          channelId: "channel-1",
          channelTitle: "Channel 1",
          marketId: "market-1",
          marketCode: "US",
          publishedAt: "2026-11-01T00:00:00.000Z",
          currentViewCount: "1234567890123",
          formatClassification: "short_candidate",
          monitoringState: "monitoring",
          latestViralScore: 72.5,
          latestScoreComputedAt: "2026-11-05T12:00:00.000Z",
          lastSnapshotAt: "2026-11-05T06:00:00.000Z",
          isWatchlisted: true,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("passes nulls through for a video with no channel/market/score/snapshot yet", async () => {
    vi.mocked(listVideos).mockResolvedValue([
      {
        id: "video-1",
        youtubeVideoId: "abc123",
        title: "Title",
        thumbnailUrl: null,
        channelId: null,
        channelTitle: null,
        marketId: null,
        marketCode: null,
        publishedAt: new Date("2026-11-01T00:00:00.000Z"),
        currentViewCount: null,
        formatClassification: "unclassified",
        monitoringState: "candidate",
        latestViralScore: null,
        latestScoreComputedAt: null,
        lastSnapshotAt: null,
        isWatchlisted: false,
      },
    ] as never);
    vi.mocked(countVideos).mockResolvedValue(1);
    const service = new VideosService();

    const result = await service.list({}, undefined, undefined);

    expect(result.items[0]).toEqual({
      id: "video-1",
      youtubeVideoId: "abc123",
      title: "Title",
      thumbnailUrl: null,
      channelId: null,
      channelTitle: null,
      marketId: null,
      marketCode: null,
      publishedAt: "2026-11-01T00:00:00.000Z",
      currentViewCount: null,
      formatClassification: "unclassified",
      monitoringState: "candidate",
      latestViralScore: null,
      latestScoreComputedAt: null,
      lastSnapshotAt: null,
      isWatchlisted: false,
    });
  });

  it("throws NotFoundException for detail when the video does not exist", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.detail("missing-video")).rejects.toThrow(NotFoundException);
  });

  it("maps a found video's detail row, including channel/discovery/topics", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue({
      id: "video-1",
      youtubeVideoId: "abc123",
      title: "Title",
      description: "Description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: new Date("2026-11-01T00:00:00.000Z"),
      durationSeconds: 45,
      formatClassification: "short_candidate",
      formatConfidence: { valueOf: () => "0.9" },
      monitoringState: "monitoring",
      currentViewCount: 1000n,
      currentLikeCount: 10n,
      currentCommentCount: 2n,
      channel: { id: "channel-1", title: "Channel 1", channelTier: "breakout", currentSubscriberCount: 20_000n },
      discoveryEvents: [
        { discoveredAt: new Date("2026-11-01T00:00:00.000Z"), source: "search", market: { code: "US" } },
      ],
      videoTopics: [
        {
          relationType: "primary",
          confidence: { valueOf: () => "0.8" },
          topic: { id: "topic-1", canonicalName: "Topic 1" },
        },
      ],
    } as never);
    const service = new VideosService();

    const result = await service.detail("video-1");

    expect(result).toEqual({
      id: "video-1",
      youtubeVideoId: "abc123",
      title: "Title",
      description: "Description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: "2026-11-01T00:00:00.000Z",
      durationSeconds: 45,
      formatClassification: "short_candidate",
      formatConfidence: 0.9,
      monitoringState: "monitoring",
      currentViewCount: "1000",
      currentLikeCount: "10",
      currentCommentCount: "2",
      channel: { id: "channel-1", title: "Channel 1", channelTier: "breakout", currentSubscriberCount: "20000" },
      discoveryHistory: [{ discoveredAt: "2026-11-01T00:00:00.000Z", source: "search", marketCode: "US" }],
      topics: [{ id: "topic-1", canonicalName: "Topic 1", relationType: "primary", confidence: 0.8 }],
      isWatchlisted: false,
    });
    expect(isWatchlisted).not.toHaveBeenCalled();
  });

  it("includes isWatchlisted computed from the watchlist repository when a userId is given", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue({
      id: "video-1",
      youtubeVideoId: "abc123",
      title: "Title",
      description: "Description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: new Date("2026-11-01T00:00:00.000Z"),
      durationSeconds: 45,
      formatClassification: "short_candidate",
      formatConfidence: { valueOf: () => "0.9" },
      monitoringState: "monitoring",
      currentViewCount: 1000n,
      currentLikeCount: 10n,
      currentCommentCount: 2n,
      channel: { id: "channel-1", title: "Channel 1", channelTier: "breakout", currentSubscriberCount: 20_000n },
      discoveryEvents: [],
      videoTopics: [],
    } as never);
    vi.mocked(isWatchlisted).mockResolvedValue(true);
    const service = new VideosService();

    const result = await service.detail("video-1", "user-1");

    expect(isWatchlisted).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "video", entityId: "video-1" });
    expect(result.isWatchlisted).toBe(true);
  });

  it("passes a null channel and empty market code through when missing", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue({
      id: "video-1",
      youtubeVideoId: "abc123",
      title: "Title",
      description: "Description",
      thumbnailUrl: null,
      publishedAt: new Date("2026-11-01T00:00:00.000Z"),
      durationSeconds: null,
      formatClassification: "unclassified",
      formatConfidence: { valueOf: () => "0" },
      monitoringState: "candidate",
      currentViewCount: null,
      currentLikeCount: null,
      currentCommentCount: null,
      channel: null,
      discoveryEvents: [{ discoveredAt: new Date("2026-11-01T00:00:00.000Z"), source: "search", market: null }],
      videoTopics: [],
    } as never);
    const service = new VideosService();

    const result = await service.detail("video-1");

    expect(result.channel).toBeNull();
    expect(result.discoveryHistory).toEqual([{ discoveredAt: "2026-11-01T00:00:00.000Z", source: "search", marketCode: null }]);
    expect(result.topics).toEqual([]);
    expect(result.isWatchlisted).toBe(false);
  });

  it("throws NotFoundException when the video does not exist", async () => {
    vi.mocked(getVideoById).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.getSnapshots("missing-video")).rejects.toThrow(NotFoundException);
    expect(listVideoSnapshots).not.toHaveBeenCalled();
  });

  it("maps snapshots with BigInt counts stringified", async () => {
    vi.mocked(getVideoById).mockResolvedValue({ id: "video-1" } as never);
    vi.mocked(listVideoSnapshots).mockResolvedValue([
      {
        collectedAt: new Date("2026-11-05T12:00:00.000Z"),
        viewCount: 1234567890123n,
        likeCount: null,
        commentCount: 42n,
        fetchStatus: "ok",
        source: "videos.list",
      },
    ] as never);
    const service = new VideosService();

    const result = await service.getSnapshots("video-1");

    expect(result).toEqual([
      {
        collectedAt: "2026-11-05T12:00:00.000Z",
        viewCount: "1234567890123",
        likeCount: null,
        commentCount: "42",
        fetchStatus: "ok",
        source: "videos.list",
      },
    ]);
  });

  it("throws NotFoundException for scores when the video does not exist", async () => {
    vi.mocked(getVideoById).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.getScores("missing-video")).rejects.toThrow(NotFoundException);
    expect(listVideoScores).not.toHaveBeenCalled();
  });

  it("maps scores with Decimal fields converted to numbers", async () => {
    vi.mocked(getVideoById).mockResolvedValue({ id: "video-1" } as never);
    vi.mocked(listVideoScores).mockResolvedValue([
      {
        computedAt: new Date("2026-11-05T12:00:00.000Z"),
        viralScore: { toNumber: () => 72.5 },
        scoreBreakdown: { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } },
        dataConfidence: { toNumber: () => 0.9 },
      },
    ] as never);
    const service = new VideosService();

    const result = await service.getScores("video-1");

    expect(result).toEqual([
      {
        computedAt: "2026-11-05T12:00:00.000Z",
        viralScore: 72.5,
        scoreBreakdown: { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } },
        dataConfidence: 0.9,
      },
    ]);
  });

  it("star() adds the video to the watchlist when the video exists", async () => {
    vi.mocked(getVideoById).mockResolvedValue({ id: "video-1" } as never);
    const service = new VideosService();

    await service.star("video-1", "user-1");

    expect(addToWatchlist).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "video", entityId: "video-1" });
  });

  it("star() throws NotFoundException and does not touch the watchlist when the video does not exist", async () => {
    vi.mocked(getVideoById).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.star("missing-video", "user-1")).rejects.toThrow(NotFoundException);
    expect(addToWatchlist).not.toHaveBeenCalled();
  });

  it("unstar() removes the video from the watchlist", async () => {
    const service = new VideosService();

    await service.unstar("video-1", "user-1");

    expect(removeFromWatchlist).toHaveBeenCalledWith({}, { userId: "user-1", entityType: "video", entityId: "video-1" });
  });

  describe("exportCsv", () => {
    function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "video-1",
        youtubeVideoId: "abc123",
        title: "Title, with comma",
        thumbnailUrl: null,
        channelId: "channel-1",
        channelTitle: "Channel \"One\"",
        marketId: "market-1",
        marketCode: "US",
        publishedAt: new Date("2026-11-01T00:00:00.000Z"),
        currentViewCount: 1_000n,
        formatClassification: "short_candidate",
        monitoringState: "monitoring",
        latestViralScore: 72.5,
        latestScoreComputedAt: new Date("2026-11-05T12:00:00.000Z"),
        lastSnapshotAt: new Date("2026-11-05T06:00:00.000Z"),
        isWatchlisted: false,
        ...overrides,
      };
    }

    it("fetches one row past the cap and renders a CSV with a header row", async () => {
      vi.mocked(listVideos).mockResolvedValue([makeRow()] as never);
      const service = new VideosService();

      const result = await service.exportCsv({}, "user-1");

      expect(listVideos).toHaveBeenCalledWith(
        {},
        {
          marketId: undefined,
          format: undefined,
          lifecycle: undefined,
          topicId: undefined,
          discoveryQueryId: undefined,
          channelTier: undefined,
          minViews: undefined,
          minScore: undefined,
          watchlistedOnly: false,
          userId: "user-1",
          limit: 5001,
          offset: 0,
        },
      );
      expect(result.truncated).toBe(false);
      const lines = result.csv.split("\r\n");
      expect(lines[0]).toBe("youtube_video_id,title,channel_title,market_code,published_at,current_view_count,format_classification,monitoring_state,latest_viral_score,last_snapshot_at");
      expect(lines[1]).toBe('abc123,"Title, with comma","Channel ""One""",US,2026-11-01T00:00:00.000Z,1000,short_candidate,monitoring,72.5,2026-11-05T06:00:00.000Z');
    });

    it("renders empty strings for null optional fields", async () => {
      vi.mocked(listVideos).mockResolvedValue([
        makeRow({ channelTitle: null, marketCode: null, currentViewCount: null, latestViralScore: null, lastSnapshotAt: null }),
      ] as never);
      const service = new VideosService();

      const result = await service.exportCsv({});

      expect(result.csv.split("\r\n")[1]).toBe("abc123,\"Title, with comma\",,,2026-11-01T00:00:00.000Z,,short_candidate,monitoring,,");
    });

    it("sets truncated true and drops the extra row when the filtered set exceeds MAX_EXPORT_ROWS", async () => {
      const rows = Array.from({ length: 5001 }, (_, index) => makeRow({ id: `video-${index}`, youtubeVideoId: `yt-${index}` }));
      vi.mocked(listVideos).mockResolvedValue(rows as never);
      const service = new VideosService();

      const result = await service.exportCsv({});

      expect(result.truncated).toBe(true);
      expect(result.csv.split("\r\n")).toHaveLength(5001);
    });

    it("does not truncate when the row count is exactly at the cap", async () => {
      const rows = Array.from({ length: 5000 }, (_, index) => makeRow({ id: `video-${index}`, youtubeVideoId: `yt-${index}` }));
      vi.mocked(listVideos).mockResolvedValue(rows as never);
      const service = new VideosService();

      const result = await service.exportCsv({});

      expect(result.truncated).toBe(false);
      expect(result.csv.split("\r\n")).toHaveLength(5001);
    });
  });
});
