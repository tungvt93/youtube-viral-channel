import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import ChannelsPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("ChannelsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the unfiltered list when no tier is given", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await ChannelsPage({ searchParams: {} });

    expect(fetchApi).toHaveBeenCalledWith("/channels");
  });

  it("forwards the tier filter as a query param", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await ChannelsPage({ searchParams: { tier: "breakout" } });

    expect(fetchApi).toHaveBeenCalledWith("/channels?tier=breakout");
  });

  it("forwards the watchlistedOnly filter as a query param", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await ChannelsPage({ searchParams: { watchlistedOnly: "true" } });

    expect(fetchApi).toHaveBeenCalledWith("/channels?watchlistedOnly=true");
  });

  it("renders without throwing when channels are returned", async () => {
    vi.mocked(fetchApi).mockResolvedValue([
      {
        id: "c1",
        title: "Channel 1",
        channelTier: "breakout",
        currentSubscriberCount: "1000",
        currentViewCount: "50000",
        latestChannelScore: 80,
        isWatchlisted: true,
      },
    ]);

    const result = await ChannelsPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });
});
