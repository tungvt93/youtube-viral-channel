import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";
import { starVideo, unstarVideo } from "./actions";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("starVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to the watchlist route and revalidates the videos layout and watchlist page", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await starVideo("video-1");

    expect(fetchApi).toHaveBeenCalledWith("/videos/video-1/watchlist", { method: "POST" });
    expect(revalidatePath).toHaveBeenCalledWith("/videos", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/watchlist");
  });
});

describe("unstarVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DELETEs the watchlist route and revalidates the videos layout and watchlist page", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await unstarVideo("video-1");

    expect(fetchApi).toHaveBeenCalledWith("/videos/video-1/watchlist", { method: "DELETE" });
    expect(revalidatePath).toHaveBeenCalledWith("/videos", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/watchlist");
  });
});
