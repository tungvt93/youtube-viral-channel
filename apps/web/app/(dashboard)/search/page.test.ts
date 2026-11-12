import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import SearchPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches keyword searches and markets", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await SearchPage({ searchParams: {} });

    expect(fetchApi).toHaveBeenCalledWith("/keyword-searches");
    expect(fetchApi).toHaveBeenCalledWith("/markets");
  });

  it("renders without throwing when the history list is empty", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await SearchPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });

  it("renders the rate-limited message when searchParams.error is set", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await SearchPage({ searchParams: { error: "rate_limited" } });

    expect(result).toBeTruthy();
  });

  it("renders without throwing when history rows and markets are returned", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/keyword-searches") {
        return [
          {
            id: "ks-1",
            query: "cat videos",
            marketId: "market-1",
            marketCode: "US",
            language: "en",
            status: "completed",
            videosFound: 12,
            recommendedVideosFound: 3,
            errorMessage: null,
            createdAt: "2026-11-06T00:00:00.000Z",
            finishedAt: "2026-11-06T00:01:00.000Z",
            acknowledgedAt: null,
          },
          {
            id: "ks-2",
            query: "dog videos",
            marketId: "market-1",
            marketCode: "US",
            language: "en",
            status: "failed",
            videosFound: 0,
            recommendedVideosFound: 0,
            errorMessage: "quota exceeded",
            createdAt: "2026-11-06T00:02:00.000Z",
            finishedAt: "2026-11-06T00:03:00.000Z",
            acknowledgedAt: "2026-11-06T00:04:00.000Z",
          },
          {
            id: "ks-3",
            query: "bird videos",
            marketId: "market-1",
            marketCode: "US",
            language: "en",
            status: "queued",
            videosFound: null,
            recommendedVideosFound: null,
            errorMessage: null,
            createdAt: "2026-11-06T00:05:00.000Z",
            finishedAt: null,
            acknowledgedAt: null,
          },
        ] as never;
      }
      if (path === "/markets") {
        return [{ id: "market-1", code: "US", name: "United States", defaultLanguage: "en", timezone: "UTC", enabled: true }] as never;
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await SearchPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });
});
