import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import TopicsPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

describe("TopicsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the unfiltered list when no filters are given", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await TopicsPage({ searchParams: {} });

    expect(fetchApi).toHaveBeenCalledWith("/topics");
  });

  it("forwards marketId and status filters as query params", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await TopicsPage({ searchParams: { marketId: "m1", status: "active" } });

    expect(fetchApi).toHaveBeenCalledWith("/topics?marketId=m1&status=active");
  });

  it("renders without throwing when topics are returned", async () => {
    vi.mocked(fetchApi).mockResolvedValue([
      {
        id: "t1",
        slug: "slug-1",
        canonicalName: "Topic One",
        description: "desc",
        status: "active",
        confidence: 0.8,
        latestMarketId: "m1",
        latestMomentumScore: 12.3,
        latestLifecycleState: "rising",
        latestWindowEnd: "2026-11-05T00:00:00.000Z",
      },
    ]);

    const result = await TopicsPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });
});
