import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";
import { starChannel, unstarChannel } from "./actions";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("starChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to the watchlist route and revalidates the channels layout and watchlist page", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await starChannel("channel-1");

    expect(fetchApi).toHaveBeenCalledWith("/channels/channel-1/watchlist", { method: "POST" });
    expect(revalidatePath).toHaveBeenCalledWith("/channels", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/watchlist");
  });
});

describe("unstarChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DELETEs the watchlist route and revalidates the channels layout and watchlist page", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await unstarChannel("channel-1");

    expect(fetchApi).toHaveBeenCalledWith("/channels/channel-1/watchlist", { method: "DELETE" });
    expect(revalidatePath).toHaveBeenCalledWith("/channels", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/watchlist");
  });
});
