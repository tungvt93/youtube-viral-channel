import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../../lib/api";
import ChannelDetailPage from "./page";

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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("ChannelDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the channel by id and renders without throwing", async () => {
    vi.mocked(fetchApi).mockResolvedValue({
      id: "c1",
      youtubeChannelId: "UC123",
      title: "Channel 1",
      description: "A channel",
      channelTier: "breakout",
      currentSubscriberCount: "1000",
      currentViewCount: "50000",
      currentVideoCount: "20",
      latestChannelScore: 80,
      latestScoreBreakdown: { foo: 1 },
      latestScoreDataConfidence: 0.9,
      latestScoreComputedAt: "2026-11-06T00:00:00.000Z",
      isWatchlisted: true,
    });

    const result = await ChannelDetailPage({ params: { id: "c1" } });

    expect(fetchApi).toHaveBeenCalledWith("/channels/c1");
    expect(result).toBeTruthy();
  });

  it("renders without a score breakdown panel error when no score has been computed yet", async () => {
    vi.mocked(fetchApi).mockResolvedValue({
      id: "c1",
      youtubeChannelId: "UC123",
      title: "Channel 1",
      description: "",
      channelTier: "newcomer",
      currentSubscriberCount: null,
      currentViewCount: null,
      currentVideoCount: null,
      latestChannelScore: null,
      latestScoreBreakdown: null,
      latestScoreDataConfidence: null,
      latestScoreComputedAt: null,
      isWatchlisted: false,
    });

    const result = await ChannelDetailPage({ params: { id: "c1" } });

    expect(result).toBeTruthy();
  });
});
