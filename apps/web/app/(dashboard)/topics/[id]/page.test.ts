import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../../lib/api";
import TopicDetailPage from "./page";

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

describe("TopicDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches trends by topic id and renders without throwing", async () => {
    vi.mocked(fetchApi).mockResolvedValue([
      {
        id: "1",
        marketId: "m1",
        topicId: "t1",
        windowStart: "2026-10-30T00:00:00.000Z",
        windowEnd: "2026-11-06T00:00:00.000Z",
        uniqueVideoCount: 10,
        uniqueChannelCount: 5,
        totalObservedViews: "100000",
        medianVph: 50,
        p90Vph: 200,
        outlierVideoCount: 2,
        momentumScore: 12.3,
        sampleConfidence: 0.9,
        scoreBreakdown: { foo: 1 },
        lifecycleState: "rising",
      },
    ]);

    const result = await TopicDetailPage({ params: { id: "t1" } });

    expect(fetchApi).toHaveBeenCalledWith("/topics/t1/trends");
    expect(result).toBeTruthy();
  });

  it("renders an empty state without throwing when there are no snapshots yet", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await TopicDetailPage({ params: { id: "t1" } });

    expect(result).toBeTruthy();
  });
});
