import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVideoById, listVideoSnapshots } from "@yvi/db";
import { VideosService } from "./videos.service";

vi.mock("@yvi/db", () => ({
  getVideoById: vi.fn(),
  listVideoSnapshots: vi.fn(),
  prisma: {},
}));

describe("VideosService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundException when the video does not exist", async () => {
    vi.mocked(getVideoById).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.getSnapshots("missing-video")).rejects.toThrow(NotFoundException);
    expect(listVideoSnapshots).not.toHaveBeenCalled();
  });

  it("maps snapshots with BigInt counts stringified", async () => {
    vi.mocked(getVideoById).mockResolvedValue({ id: "video-1" } as never);
    vi.mocked(listVideoSnapshots).mockResolvedValue([
      {
        collectedAt: new Date("2026-11-05T12:00:00.000Z"),
        viewCount: 1234567890123n,
        likeCount: null,
        commentCount: 42n,
        fetchStatus: "ok",
        source: "videos.list",
      },
    ] as never);
    const service = new VideosService();

    const result = await service.getSnapshots("video-1");

    expect(result).toEqual([
      {
        collectedAt: "2026-11-05T12:00:00.000Z",
        viewCount: "1234567890123",
        likeCount: null,
        commentCount: "42",
        fetchStatus: "ok",
        source: "videos.list",
      },
    ]);
  });
});
