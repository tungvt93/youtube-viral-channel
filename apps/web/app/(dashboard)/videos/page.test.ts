import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import VideosPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function mockVideosResponse(response: { items: unknown[]; total: number; limit: number; offset: number }): void {
  vi.mocked(fetchApi).mockResolvedValue(response as never);
}

describe("VideosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the unfiltered list when no filters are given", async () => {
    mockVideosResponse({ items: [], total: 0, limit: 20, offset: 0 });

    await VideosPage({ searchParams: {} });

    expect(fetchApi).toHaveBeenCalledWith("/videos?limit=20&offset=0");
  });

  it("forwards all given filters as query params", async () => {
    mockVideosResponse({ items: [], total: 0, limit: 20, offset: 0 });

    await VideosPage({
      searchParams: {
        marketId: "market-1",
        format: "short_candidate",
        lifecycle: "monitoring",
        topicId: "topic-1",
        channelTier: "breakout",
        minViews: "1000",
        minScore: "50",
        watchlistedOnly: "true",
      },
    });

    const calledWith = vi.mocked(fetchApi).mock.calls[0][0] as string;
    expect(calledWith).toContain("marketId=market-1");
    expect(calledWith).toContain("format=short_candidate");
    expect(calledWith).toContain("lifecycle=monitoring");
    expect(calledWith).toContain("topicId=topic-1");
    expect(calledWith).toContain("channelTier=breakout");
    expect(calledWith).toContain("minViews=1000");
    expect(calledWith).toContain("minScore=50");
    expect(calledWith).toContain("watchlistedOnly=true");
  });

  it("renders without throwing when videos are returned", async () => {
    mockVideosResponse({
      items: [
        {
          id: "v1",
          title: "Video 1",
          thumbnailUrl: "https://example.com/thumb.jpg",
          channelTitle: "Channel 1",
          marketCode: "US",
          publishedAt: "2026-11-01T00:00:00.000Z",
          currentViewCount: "1000",
          monitoringState: "monitoring",
          latestViralScore: 72.5,
          lastSnapshotAt: "2026-11-05T00:00:00.000Z",
          isWatchlisted: false,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    const result = await VideosPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });

  it("renders the empty state without throwing when no videos match", async () => {
    mockVideosResponse({ items: [], total: 0, limit: 20, offset: 0 });

    const result = await VideosPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });

  it("requests the second page with the correct offset and shows pagination controls", async () => {
    mockVideosResponse({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `v${i}`,
        title: `Video ${i}`,
        thumbnailUrl: null,
        channelTitle: null,
        marketCode: null,
        publishedAt: "2026-11-01T00:00:00.000Z",
        currentViewCount: null,
        monitoringState: "monitoring",
        latestViralScore: null,
        lastSnapshotAt: null,
        isWatchlisted: false,
      })),
      total: 45,
      limit: 20,
      offset: 20,
    });

    await VideosPage({ searchParams: { page: "2" } });

    const calledWith = vi.mocked(fetchApi).mock.calls[0][0] as string;
    expect(calledWith).toContain("offset=20");
    expect(calledWith).toContain("limit=20");
  });
});
