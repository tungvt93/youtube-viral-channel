import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchApi } from "../../../lib/api";
import { ackKeywordSearch, createKeywordSearch } from "./actions";

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

describe("createKeywordSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts query/marketId/language as a JSON body and revalidates /search", async () => {
    const { revalidatePath } = await import("next/cache");
    vi.mocked(fetchApi).mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("query", "cat videos");
    formData.set("marketId", "market-1");
    formData.set("language", "en");

    await createKeywordSearch(formData);

    expect(fetchApi).toHaveBeenCalledWith("/keyword-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "cat videos",
        marketId: "market-1",
        language: "en",
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/search");
  });

  it("redirects with a rate-limited flag on a 429", async () => {
    const { redirect } = await import("next/navigation");
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(429, "rate limited"));
    const formData = new FormData();
    formData.set("query", "cat videos");
    formData.set("marketId", "market-1");
    formData.set("language", "en");

    await expect(createKeywordSearch(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/search?error=rate_limited");
  });

  it("rethrows a non-429 error", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new ApiError(500, "boom"));
    const formData = new FormData();
    formData.set("query", "cat videos");
    formData.set("marketId", "market-1");
    formData.set("language", "en");

    await expect(createKeywordSearch(formData)).rejects.toThrow("boom");
  });
});

describe("ackKeywordSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the ack endpoint and revalidates /search", async () => {
    const { revalidatePath } = await import("next/cache");
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await ackKeywordSearch("ks-1");

    expect(fetchApi).toHaveBeenCalledWith("/keyword-searches/ks-1/ack", { method: "POST" });
    expect(revalidatePath).toHaveBeenCalledWith("/search");
  });
});
