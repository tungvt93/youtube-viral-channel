import { describe, expect, it, vi } from "vitest";
import { VideosController } from "./videos.controller";
import type { VideosService } from "./videos.service";

describe("VideosController", () => {
  it("delegates a snapshot-history lookup to the service", async () => {
    const getSnapshots = vi.fn().mockResolvedValue([{ collectedAt: "2026-11-05T12:00:00.000Z", viewCount: "1000", likeCount: null, commentCount: null, fetchStatus: "ok", source: "videos.list" }]);
    const controller = new VideosController({ getSnapshots } as unknown as VideosService);

    const result = await controller.snapshots("video-1");

    expect(getSnapshots).toHaveBeenCalledWith("video-1");
    expect(result).toEqual([{ collectedAt: "2026-11-05T12:00:00.000Z", viewCount: "1000", likeCount: null, commentCount: null, fetchStatus: "ok", source: "videos.list" }]);
  });
});
