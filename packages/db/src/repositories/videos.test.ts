import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { getVideoById, listVideosDueForSnapshot, updateVideoMonitoringState, upsertVideo, type VideoUpsertInput } from "./videos";

const baseInput: VideoUpsertInput = {
  youtubeVideoId: "abc123",
  channelId: "channel-uuid",
  title: "Title",
  description: "Description",
  publishedAt: new Date("2026-11-01T00:00:00Z"),
  durationSeconds: 45,
  categoryId: "22",
  defaultLanguage: "en",
  thumbnailUrl: "https://example.com/thumb.jpg",
  currentViewCount: 1000n,
  currentLikeCount: 10n,
  currentCommentCount: 2n,
  videoLicense: "youtube",
  privacyStatus: "public",
  embeddable: true,
  liveBroadcastContent: "none",
  formatClassification: "short_candidate",
  formatConfidence: 0.9,
};

describe("upsertVideo", () => {
  it("upserts by the unique youtube_video_id and sets lastEnrichedAt", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "video-uuid" });
    const db = { video: { upsert } } as unknown as PrismaClient;

    await upsertVideo(db, baseInput);

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({ youtubeVideoId: "abc123" });
    expect(call.create.youtubeVideoId).toBe("abc123");
    expect(call.create.categoryId).toBe("22");
    expect(call.update.categoryId).toBe("22");
    expect(call.update.lastEnrichedAt).toBeInstanceOf(Date);
  });
});

describe("getVideoById", () => {
  it("looks up a video by its internal id", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "video-1" });
    const db = { video: { findUnique } } as unknown as PrismaClient;

    await getVideoById(db, "video-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "video-1" } });
  });
});

describe("listVideosDueForSnapshot", () => {
  it("excludes unavailable videos and filters by nextSnapshotDueAt, oldest-due first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { video: { findMany } } as unknown as PrismaClient;
    const now = new Date("2026-11-05T12:00:00Z");

    await listVideosDueForSnapshot(db, now, 50);

    expect(findMany).toHaveBeenCalledWith({
      where: { monitoringState: { not: "unavailable" }, nextSnapshotDueAt: { lte: now } },
      orderBy: { nextSnapshotDueAt: "asc" },
      take: 50,
      select: { id: true, youtubeVideoId: true, publishedAt: true, monitoringState: true, lastSnapshotAt: true },
    });
  });
});

describe("updateVideoMonitoringState", () => {
  it("writes monitoringState/lastSnapshotAt/nextSnapshotDueAt for the given video id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "video-1" });
    const db = { video: { update } } as unknown as PrismaClient;
    const lastSnapshotAt = new Date("2026-11-05T12:00:00Z");
    const nextSnapshotDueAt = new Date("2026-11-05T18:00:00Z");

    await updateVideoMonitoringState(db, "video-1", { monitoringState: "monitoring", lastSnapshotAt, nextSnapshotDueAt });

    expect(update).toHaveBeenCalledWith({
      where: { id: "video-1" },
      data: { monitoringState: "monitoring", lastSnapshotAt, nextSnapshotDueAt },
    });
  });
});
