import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import WatchlistPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches watchlisted videos and channels", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await WatchlistPage();

    expect(fetchApi).toHaveBeenCalledWith("/videos?watchlistedOnly=true");
    expect(fetchApi).toHaveBeenCalledWith("/channels?watchlistedOnly=true");
  });

  it("renders without throwing when both lists are empty", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await WatchlistPage();

    expect(result).toBeTruthy();
  });

  it("renders without throwing when videos and channels are returned", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/videos?watchlistedOnly=true") {
        return [
          {
            id: "v1",
            title: "Video 1",
            thumbnailUrl: null,
            channelTitle: "Channel 1",
            marketCode: "US",
            publishedAt: "2026-11-01T00:00:00.000Z",
            currentViewCount: "1000",
            monitoringState: "monitoring",
            latestViralScore: 72.5,
            isWatchlisted: true,
          },
        ] as never;
      }
      if (path === "/channels?watchlistedOnly=true") {
        return [
          { id: "c1", title: "Channel 1", channelTier: "breakout", currentSubscriberCount: "1000", currentViewCount: "50000", latestChannelScore: 80, isWatchlisted: true },
        ] as never;
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await WatchlistPage();

    expect(result).toBeTruthy();
  });
});
