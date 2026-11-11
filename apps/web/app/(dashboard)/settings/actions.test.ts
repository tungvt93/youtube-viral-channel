import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import { updateMarketEnabled } from "./actions";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("updateMarketEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches the market's enabled flag", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await updateMarketEnabled("market-1", false);

    expect(fetchApi).toHaveBeenCalledWith("/markets/market-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });
});
