import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../lib/api";
import OverviewPage from "./page";

vi.mock("../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches all three overview endpoints and renders a React element without throwing", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/overview/summary") {
        return { newVideosToday: 3, emergingVideosCount: 2, breakoutChannelsCount: 1, risingTopicsCount: 5, activeMarketsCount: 4 };
      }
      if (path === "/overview/discovery-volume") {
        return { byDay: [], byMarket: [] };
      }
      return { topEmergingVideos: [], topRisingTopics: [], topBreakoutChannels: [] };
    });

    const result = await OverviewPage();

    expect(fetchApi).toHaveBeenCalledWith("/overview/summary");
    expect(fetchApi).toHaveBeenCalledWith("/overview/discovery-volume");
    expect(fetchApi).toHaveBeenCalledWith("/overview/top-signals");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
  });
});
