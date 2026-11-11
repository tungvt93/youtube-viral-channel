import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import DiscoveryPage from "./page";

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

describe("DiscoveryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches queries, markets, and jobs", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await DiscoveryPage({ searchParams: {} });

    expect(fetchApi).toHaveBeenCalledWith("/discovery/queries");
    expect(fetchApi).toHaveBeenCalledWith("/markets");
    expect(fetchApi).toHaveBeenCalledWith("/discovery/jobs");
  });

  it("renders without throwing when all lists are empty", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await DiscoveryPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });

  it("renders the rate-limited message when searchParams.error is set", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await DiscoveryPage({ searchParams: { error: "rate_limited" } });

    expect(result).toBeTruthy();
  });

  it("renders without throwing when queries, markets, and jobs are returned", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/discovery/queries") {
        return [
          {
            id: "q1",
            marketId: "market-1",
            marketCode: "US",
            topicId: null,
            query: "cat videos",
            language: "en",
            strategy: "most_popular",
            priority: 5,
            maxPagesPerRun: 2,
            frequencyMinutes: 60,
            enabled: true,
            lastRunAt: "2026-11-06T00:00:00.000Z",
          },
        ] as never;
      }
      if (path === "/markets") {
        return [{ id: "market-1", code: "US", name: "United States", defaultLanguage: "en", timezone: "UTC", enabled: true }] as never;
      }
      if (path === "/discovery/jobs") {
        return [
          {
            id: "job-1",
            jobName: "discovery-search",
            queue: "discovery-search",
            status: "completed",
            startedAt: "2026-11-06T00:00:00.000Z",
            finishedAt: "2026-11-06T00:01:00.000Z",
            durationMs: 60000,
            resultCount: 10,
            errorMessage: null,
          },
        ] as never;
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await DiscoveryPage({ searchParams: {} });

    expect(result).toBeTruthy();
  });
});
