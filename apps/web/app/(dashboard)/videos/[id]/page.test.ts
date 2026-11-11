import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../../lib/api";
import VideoDetailPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../../../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  fetchApi: vi.fn(),
}));

const baseVideo = {
  id: "v1",
  youtubeVideoId: "abc123",
  title: "Video 1",
  description: "A video",
  thumbnailUrl: "https://example.com/thumb.jpg",
  publishedAt: "2026-11-01T00:00:00.000Z",
  durationSeconds: 45,
  formatClassification: "short_candidate",
  formatConfidence: 0.9,
  monitoringState: "monitoring",
  currentViewCount: "1000",
  currentLikeCount: "10",
  currentCommentCount: "2",
  channel: { id: "c1", title: "Channel 1", channelTier: "breakout", currentSubscriberCount: "20000" },
  discoveryHistory: [{ discoveredAt: "2026-11-01T00:00:00.000Z", source: "search", marketCode: "US" }],
  topics: [{ id: "t1", canonicalName: "Topic 1", relationType: "primary", confidence: 0.8 }],
  isWatchlisted: false,
};

describe("VideoDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the video detail, snapshots, and scores by id", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/videos/v1") return baseVideo as never;
      if (path === "/videos/v1/snapshots") return [] as never;
      if (path === "/videos/v1/scores") return [] as never;
      throw new Error(`unexpected path ${path}`);
    });

    const result = await VideoDetailPage({ params: { id: "v1" } });

    expect(fetchApi).toHaveBeenCalledWith("/videos/v1/snapshots");
    expect(fetchApi).toHaveBeenCalledWith("/videos/v1/scores");
    expect(result).toBeTruthy();
  });

  it("renders without throwing when snapshots and scores are present", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/videos/v1") return baseVideo as never;
      if (path === "/videos/v1/snapshots") {
        return [
          { collectedAt: "2026-11-05T12:00:00.000Z", viewCount: "2000", likeCount: "20", commentCount: "4", fetchStatus: "ok", source: "videos.list" },
          { collectedAt: "2026-11-05T06:00:00.000Z", viewCount: "1000", likeCount: "10", commentCount: "2", fetchStatus: "ok", source: "videos.list" },
        ] as never;
      }
      if (path === "/videos/v1/scores") {
        return [
          {
            computedAt: "2026-11-05T12:00:00.000Z",
            viralScore: 72.5,
            scoreBreakdown: { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } },
            dataConfidence: 0.9,
          },
        ] as never;
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await VideoDetailPage({ params: { id: "v1" } });

    expect(result).toBeTruthy();
  });

  it("renders without throwing when the video has no channel, discovery history, or topics yet", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/videos/v1") {
        return { ...baseVideo, channel: null, discoveryHistory: [], topics: [] } as never;
      }
      if (path === "/videos/v1/snapshots") return [] as never;
      if (path === "/videos/v1/scores") return [] as never;
      throw new Error(`unexpected path ${path}`);
    });

    const result = await VideoDetailPage({ params: { id: "v1" } });

    expect(result).toBeTruthy();
  });
});
