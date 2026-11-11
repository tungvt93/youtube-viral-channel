import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchApi } from "../../../lib/api";
import { createDiscoveryQuery, triggerDiscoveryRun, updateDiscoveryQueryEnabled } from "./actions";

vi.mock("../../../lib/api", () => ({
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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("createDiscoveryQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the form fields as a JSON body", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("marketId", "market-1");
    formData.set("query", "cat videos");
    formData.set("topicId", "");
    formData.set("language", "en");
    formData.set("strategy", "most_popular");
    formData.set("priority", "5");
    formData.set("maxPagesPerRun", "2");
    formData.set("frequencyMinutes", "60");

    await createDiscoveryQuery(formData);

    expect(fetchApi).toHaveBeenCalledWith("/discovery/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: "market-1",
        topicId: null,
        query: "cat videos",
        language: "en",
        strategy: "most_popular",
        priority: 5,
        maxPagesPerRun: 2,
        frequencyMinutes: 60,
      }),
    });
  });
});

describe("updateDiscoveryQueryEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches the enabled flag", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await updateDiscoveryQueryEnabled("q1", false);

    expect(fetchApi).toHaveBeenCalledWith("/discovery/queries/q1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });
});

describe("triggerDiscoveryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the run endpoint", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await triggerDiscoveryRun("q1");

    expect(fetchApi).toHaveBeenCalledWith("/discovery/queries/q1/run", { method: "POST" });
  });

  it("redirects with a rate-limited flag on a 429", async () => {
    const { redirect } = await import("next/navigation");
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(429, "rate limited"));

    await expect(triggerDiscoveryRun("q1")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/discovery?error=rate_limited");
  });

  it("rethrows a non-429 error", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(500, "boom"));

    await expect(triggerDiscoveryRun("q1")).rejects.toThrow("boom");
  });
});
