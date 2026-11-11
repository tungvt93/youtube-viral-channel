import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import SystemPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

const health = { status: "ok", quotaPercentUsed: 42, failedCallsToday: 0, recentJobFailures: 0 };
const quota = { budget: 10000, usedToday: 4200, percentUsed: 42, band: "ok", remainingBudget: 5800, projectedEndOfDay: 8000 };
const apiUsage = { byEndpoint: [], byMarket: [] };

describe("SystemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches health, jobs, quota, and api usage", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/system/health") return health as never;
      if (path === "/system/jobs") return [] as never;
      if (path === "/system/quota") return quota as never;
      if (path === "/system/api-usage") return apiUsage as never;
      throw new Error(`unexpected path ${path}`);
    });

    await SystemPage();

    expect(fetchApi).toHaveBeenCalledWith("/system/health");
    expect(fetchApi).toHaveBeenCalledWith("/system/jobs");
    expect(fetchApi).toHaveBeenCalledWith("/system/quota");
    expect(fetchApi).toHaveBeenCalledWith("/system/api-usage");
  });

  it("renders without throwing when jobs and usage breakdowns are empty", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/system/health") return health as never;
      if (path === "/system/jobs") return [] as never;
      if (path === "/system/quota") return quota as never;
      if (path === "/system/api-usage") return apiUsage as never;
      throw new Error(`unexpected path ${path}`);
    });

    const result = await SystemPage();

    expect(result).toBeTruthy();
  });

  it("renders without throwing when jobs and usage breakdowns are populated", async () => {
    vi.mocked(fetchApi).mockImplementation(async (path: string) => {
      if (path === "/system/health") return { status: "degraded", quotaPercentUsed: 97, failedCallsToday: 3, recentJobFailures: 2 } as never;
      if (path === "/system/jobs") {
        return [
          {
            id: "job-1",
            jobName: "discovery-search",
            queue: "discovery-search",
            status: "failed",
            startedAt: "2026-11-06T00:00:00.000Z",
            finishedAt: "2026-11-06T00:01:00.000Z",
            durationMs: 60000,
            resultCount: null,
            errorMessage: "quota exceeded",
          },
        ] as never;
      }
      if (path === "/system/quota") return { ...quota, band: "critical", percentUsed: 97 } as never;
      if (path === "/system/api-usage") {
        return {
          byEndpoint: [{ endpoint: "videos.list", totalQuota: 500 }],
          byMarket: [{ marketId: "market-1", marketCode: "US", totalQuota: 300 }],
        } as never;
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await SystemPage();

    expect(result).toBeTruthy();
  });
});
