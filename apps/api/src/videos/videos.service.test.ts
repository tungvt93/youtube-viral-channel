import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVideoById, listVideoScores, listVideoSnapshots } from "@yvi/db";
import { VideosService } from "./videos.service";

vi.mock("@yvi/db", () => ({
  getVideoById: vi.fn(),
  listVideoScores: vi.fn(),
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

  it("throws NotFoundException for scores when the video does not exist", async () => {
    vi.mocked(getVideoById).mockResolvedValue(null);
    const service = new VideosService();

    await expect(service.getScores("missing-video")).rejects.toThrow(NotFoundException);
    expect(listVideoScores).not.toHaveBeenCalled();
  });

  it("maps scores with Decimal fields converted to numbers", async () => {
    vi.mocked(getVideoById).mockResolvedValue({ id: "video-1" } as never);
    vi.mocked(listVideoScores).mockResolvedValue([
      {
        computedAt: new Date("2026-11-05T12:00:00.000Z"),
        viralScore: { toNumber: () => 72.5 },
        scoreBreakdown: { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } },
        dataConfidence: { toNumber: () => 0.9 },
      },
    ] as never);
    const service = new VideosService();

    const result = await service.getScores("video-1");

    expect(result).toEqual([
      {
        computedAt: "2026-11-05T12:00:00.000Z",
        viralScore: 72.5,
        scoreBreakdown: { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } },
        dataConfidence: 0.9,
      },
    ]);
  });
});
