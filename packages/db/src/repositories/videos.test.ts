import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  getVideoById,
  getVideoIdsByYoutubeIds,
  listChannelPeerViews,
  listKnownYoutubeVideoIds,
  listRecommendedScrapeSeeds,
  listVideosDueForSnapshot,
  listVideosEligibleForClassification,
  listVideosEligibleForScoring,
  markVideoRecommendedScraped,
  updateVideoClassification,
  updateVideoMonitoringState,
  upsertVideo,
  type VideoUpsertInput,
} from "./videos";

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
  tags: ["tag1", "tag2"],
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

describe("listVideosEligibleForScoring", () => {
  it("selects monitoring/high_signal/cooling videos oldest-snapshot-first and flattens the channel's subscriber count", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "video-1",
        channelId: "channel-1",
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        monitoringState: "monitoring",
        lastSnapshotAt: new Date("2026-11-05T06:00:00Z"),
        formatClassification: "shorts",
        currentViewCount: 5000n,
        channel: { currentSubscriberCount: 20000n },
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listVideosEligibleForScoring(db, 200);

    expect(findMany).toHaveBeenCalledWith({
      where: { monitoringState: { in: ["monitoring", "high_signal", "cooling"] } },
      orderBy: { lastSnapshotAt: "asc" },
      take: 200,
      select: {
        id: true,
        channelId: true,
        publishedAt: true,
        monitoringState: true,
        lastSnapshotAt: true,
        formatClassification: true,
        currentViewCount: true,
        channel: { select: { currentSubscriberCount: true } },
      },
    });
    expect(result).toEqual([
      {
        id: "video-1",
        channelId: "channel-1",
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        monitoringState: "monitoring",
        lastSnapshotAt: new Date("2026-11-05T06:00:00Z"),
        formatClassification: "shorts",
        currentViewCount: 5000n,
        channelSubscriberCount: 20000n,
      },
    ]);
  });

  it("flattens a missing channel relation to a null subscriber count", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "video-1",
        channelId: null,
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        monitoringState: "cooling",
        lastSnapshotAt: null,
        formatClassification: "shorts",
        currentViewCount: null,
        channel: null,
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listVideosEligibleForScoring(db, 200);

    expect(result[0].channelSubscriberCount).toBeNull();
  });
});

describe("listChannelPeerViews", () => {
  it("selects a channel's most-recent videos with a known view count", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "video-2", currentViewCount: 9000n },
      { id: "video-3", currentViewCount: 8000n },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listChannelPeerViews(db, "channel-1", 21);

    expect(findMany).toHaveBeenCalledWith({
      where: { channelId: "channel-1", currentViewCount: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 21,
      select: { id: true, currentViewCount: true },
    });
    expect(result).toEqual([
      { videoId: "video-2", currentViewCount: 9000n },
      { videoId: "video-3", currentViewCount: 8000n },
    ]);
  });
});

describe("listKnownYoutubeVideoIds", () => {
  it("returns a set of the already-known ids among the given ones", async () => {
    const findMany = vi.fn().mockResolvedValue([{ youtubeVideoId: "vid1" }, { youtubeVideoId: "vid2" }]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listKnownYoutubeVideoIds(db, ["vid1", "vid2", "vid3"]);

    expect(findMany).toHaveBeenCalledWith({
      where: { youtubeVideoId: { in: ["vid1", "vid2", "vid3"] } },
      select: { youtubeVideoId: true },
    });
    expect(result).toEqual(new Set(["vid1", "vid2"]));
  });

  it("returns an empty set without querying when given no ids", async () => {
    const findMany = vi.fn();
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listKnownYoutubeVideoIds(db, []);

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual(new Set());
  });
});

describe("listVideosEligibleForClassification", () => {
  it("selects videos with no successful classification run, oldest-discovered first, flattening the channel", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "video-1",
        title: "Title",
        description: "Desc",
        tags: ["a", "b"],
        categoryId: "22",
        channel: { title: "Channel", description: "Channel bio" },
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listVideosEligibleForClassification(db, 25);

    expect(findMany).toHaveBeenCalledWith({
      where: { aiClassificationRuns: { none: { status: "success" } } },
      orderBy: { firstDiscoveredAt: "asc" },
      take: 25,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        categoryId: true,
        channel: { select: { title: true, description: true } },
      },
    });
    expect(result).toEqual([
      {
        id: "video-1",
        title: "Title",
        description: "Desc",
        tags: ["a", "b"],
        categoryId: "22",
        channelTitle: "Channel",
        channelDescription: "Channel bio",
      },
    ]);
  });

  it("flattens a missing channel to empty title/description", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "video-1", title: "T", description: "D", tags: [], categoryId: "22", channel: null },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const result = await listVideosEligibleForClassification(db, 25);

    expect(result[0].channelTitle).toBe("");
    expect(result[0].channelDescription).toBe("");
  });
});

describe("updateVideoClassification", () => {
  it("writes formatClassification/formatConfidence for the given video id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "video-1" });
    const db = { video: { update } } as unknown as PrismaClient;

    await updateVideoClassification(db, "video-1", "tutorial", 0.87);

    expect(update).toHaveBeenCalledWith({
      where: { id: "video-1" },
      data: { formatClassification: "tutorial", formatConfidence: 0.87 },
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

describe("listRecommendedScrapeSeeds", () => {
  it("resolves gl/hl from the earliest DiscoveryEvent's market for a first-generation seed", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "v1",
        youtubeVideoId: "yt1",
        discoveryEvents: [
          { source: "search", sourcePayload: null, market: { code: "US", defaultLanguage: "en" } },
        ],
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([{ videoId: "v1", youtubeVideoId: "yt1", gl: "US", hl: "en", rootSeedVideoId: "v1" }]);
  });

  it("reuses the root seed's gl/hl verbatim from sourcePayload for a recommended_scrape-origin seed", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "v2",
        youtubeVideoId: "yt2",
        discoveryEvents: [
          {
            source: "recommended_scrape",
            sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" },
            market: null,
          },
        ],
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([{ videoId: "v2", youtubeVideoId: "yt2", gl: "US", hl: "en", rootSeedVideoId: "v1" }]);
  });

  it("skips a seed whose earliest DiscoveryEvent has no resolvable market", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "v3", youtubeVideoId: "yt3", discoveryEvents: [{ source: "channel_uploads", sourcePayload: null, market: null }] },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([]);
  });
});

describe("markVideoRecommendedScraped", () => {
  it("sets recommendedScrapedAt on the given video", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { video: { update } } as unknown as PrismaClient;
    const scrapedAt = new Date("2026-11-11T00:00:00Z");

    await markVideoRecommendedScraped(db, "v1", scrapedAt);

    expect(update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { recommendedScrapedAt: scrapedAt } });
  });
});

describe("getVideoIdsByYoutubeIds", () => {
  it("maps youtube video ids to internal ids for videos that already exist", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "v1", youtubeVideoId: "yt1" }]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const map = await getVideoIdsByYoutubeIds(db, ["yt1", "yt2"]);

    expect(map).toEqual(new Map([["yt1", "v1"]]));
  });

  it("returns an empty map without querying for an empty input", async () => {
    const findMany = vi.fn();
    const db = { video: { findMany } } as unknown as PrismaClient;

    const map = await getVideoIdsByYoutubeIds(db, []);

    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
