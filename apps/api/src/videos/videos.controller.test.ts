import { describe, expect, it, vi } from "vitest";
import { VideosController } from "./videos.controller";
import type { VideosService } from "./videos.service";

describe("VideosController", () => {
  it("delegates a list lookup to the service with query params, pagination, and the current user id", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "video-1" }]);
    const controller = new VideosController({ list } as unknown as VideosService);

    const result = await controller.list(
      "market-1",
      "shorts",
      "monitoring",
      "topic-1",
      "query-1",
      "search-1",
      "breakout",
      "1000",
      "50",
      "true",
      "10",
      "5",
      { id: "user-1" } as never,
    );

    expect(list).toHaveBeenCalledWith(
      {
        marketId: "market-1",
        format: "shorts",
        lifecycle: "monitoring",
        topicId: "topic-1",
        discoveryQueryId: "query-1",
        keywordSearchId: "search-1",
        channelTier: "breakout",
        minViews: "1000",
        minScore: "50",
        watchlistedOnly: "true",
      },
      "10",
      "5",
      "user-1",
    );
    expect(result).toEqual([{ id: "video-1" }]);
  });

  it("passes undefined for the user id when there is no current user", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const controller = new VideosController({ list } as unknown as VideosService);

    await controller.list(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(list).toHaveBeenCalledWith(
      {
        marketId: undefined,
        format: undefined,
        lifecycle: undefined,
        topicId: undefined,
        discoveryQueryId: undefined,
        keywordSearchId: undefined,
        channelTier: undefined,
        minViews: undefined,
        minScore: undefined,
        watchlistedOnly: undefined,
      },
      undefined,
      undefined,
      undefined,
    );
  });

  it("delegates a detail lookup to the service with the current user id", async () => {
    const detail = vi.fn().mockResolvedValue({ id: "video-1" });
    const controller = new VideosController({ detail } as unknown as VideosService);

    const result = await controller.detail("video-1", { id: "user-1" } as never);

    expect(detail).toHaveBeenCalledWith("video-1", "user-1");
    expect(result).toEqual({ id: "video-1" });
  });

  it("delegates a snapshot-history lookup to the service", async () => {
    const getSnapshots = vi.fn().mockResolvedValue([{ collectedAt: "2026-11-05T12:00:00.000Z", viewCount: "1000", likeCount: null, commentCount: null, fetchStatus: "ok", source: "videos.list" }]);
    const controller = new VideosController({ getSnapshots } as unknown as VideosService);

    const result = await controller.snapshots("video-1");

    expect(getSnapshots).toHaveBeenCalledWith("video-1");
    expect(result).toEqual([{ collectedAt: "2026-11-05T12:00:00.000Z", viewCount: "1000", likeCount: null, commentCount: null, fetchStatus: "ok", source: "videos.list" }]);
  });

  it("delegates a score-history lookup to the service", async () => {
    const getScores = vi.fn().mockResolvedValue([{ computedAt: "2026-11-05T12:00:00.000Z", viralScore: 72.5, scoreBreakdown: {}, dataConfidence: 0.9 }]);
    const controller = new VideosController({ getScores } as unknown as VideosService);

    const result = await controller.scores("video-1");

    expect(getScores).toHaveBeenCalledWith("video-1");
    expect(result).toEqual([{ computedAt: "2026-11-05T12:00:00.000Z", viralScore: 72.5, scoreBreakdown: {}, dataConfidence: 0.9 }]);
  });

  it("delegates star to the service with the current user id", async () => {
    const star = vi.fn().mockResolvedValue(undefined);
    const controller = new VideosController({ star } as unknown as VideosService);

    await controller.star("video-1", { id: "user-1" } as never);

    expect(star).toHaveBeenCalledWith("video-1", "user-1");
  });

  it("delegates unstar to the service with the current user id", async () => {
    const unstar = vi.fn().mockResolvedValue(undefined);
    const controller = new VideosController({ unstar } as unknown as VideosService);

    await controller.unstar("video-1", { id: "user-1" } as never);

    expect(unstar).toHaveBeenCalledWith("video-1", "user-1");
  });

  it("delegates export to the service and writes the CSV with the truncation header", async () => {
    const exportCsv = vi.fn().mockResolvedValue({ csv: "youtube_video_id\nabc123", truncated: false });
    const controller = new VideosController({ exportCsv } as unknown as VideosService);
    const res = { setHeader: vi.fn(), send: vi.fn() };

    await controller.export({ marketId: "market-1" }, res, { id: "user-1" } as never);

    expect(exportCsv).toHaveBeenCalledWith({ marketId: "market-1" }, "user-1");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="videos-export.csv"');
    expect(res.setHeader).toHaveBeenCalledWith("X-Export-Truncated", "false");
    expect(res.send).toHaveBeenCalledWith("youtube_video_id\nabc123");
  });

  it("sets the truncation header to true when the service reports truncation", async () => {
    const exportCsv = vi.fn().mockResolvedValue({ csv: "youtube_video_id", truncated: true });
    const controller = new VideosController({ exportCsv } as unknown as VideosService);
    const res = { setHeader: vi.fn(), send: vi.fn() };

    await controller.export({}, res);

    expect(res.setHeader).toHaveBeenCalledWith("X-Export-Truncated", "true");
  });
});
