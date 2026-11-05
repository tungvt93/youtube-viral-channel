import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { upsertVideo, type VideoUpsertInput } from "./videos";

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
