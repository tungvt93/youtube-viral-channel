import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  getChannelByYoutubeId,
  getChannelDetail,
  listChannels,
  listChannelsDueForVideoDiscovery,
  listChannelsEligibleForScoring,
  listChannelVideosForScoring,
  updateChannelLastVideoDiscoveryAt,
  updateChannelTier,
  upsertChannel,
  type ChannelUpsertInput,
} from "./channels";

const baseInput: ChannelUpsertInput = {
  youtubeChannelId: "ch1",
  title: "Channel",
  description: "Description",
  customUrl: null,
  thumbnailUrl: null,
  creatorCountry: null,
  publishedAt: null,
  uploadsPlaylistId: "UUxyz",
  currentSubscriberCount: 1000n,
  currentViewCount: 5000n,
  currentVideoCount: 10n,
  subscriberCountHidden: false,
};

describe("upsertChannel", () => {
  it("upserts by youtube_channel_id and sets lastEnrichedAt", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "channel-uuid" });
    const db = { channel: { upsert } } as unknown as PrismaClient;

    await upsertChannel(db, baseInput);

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({ youtubeChannelId: "ch1" });
    expect(call.update.lastEnrichedAt).toBeInstanceOf(Date);
  });
});

describe("getChannelByYoutubeId", () => {
  it("looks up a channel by its youtube channel id", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "channel-1" });
    const db = { channel: { findUnique } } as unknown as PrismaClient;

    await getChannelByYoutubeId(db, "ch1");

    expect(findUnique).toHaveBeenCalledWith({ where: { youtubeChannelId: "ch1" } });
  });
});

describe("listChannelsDueForVideoDiscovery", () => {
  it("only selects channels with a known uploads playlist, never-polled channels first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { channel: { findMany } } as unknown as PrismaClient;

    await listChannelsDueForVideoDiscovery(db, 25);

    expect(findMany).toHaveBeenCalledWith({
      where: { uploadsPlaylistId: { not: null } },
      orderBy: { lastVideoDiscoveryAt: { sort: "asc", nulls: "first" } },
      take: 25,
      select: { id: true, youtubeChannelId: true, uploadsPlaylistId: true, lastVideoDiscoveryAt: true },
    });
  });
});

describe("updateChannelLastVideoDiscoveryAt", () => {
  it("writes lastVideoDiscoveryAt for the given channel id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "channel-1" });
    const db = { channel: { update } } as unknown as PrismaClient;
    const at = new Date("2026-11-05T12:00:00Z");

    await updateChannelLastVideoDiscoveryAt(db, "channel-1", at);

    expect(update).toHaveBeenCalledWith({ where: { id: "channel-1" }, data: { lastVideoDiscoveryAt: at } });
  });
});

describe("updateChannelTier", () => {
  it("writes channelTier for the given channel id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "channel-1" });
    const db = { channel: { update } } as unknown as PrismaClient;

    await updateChannelTier(db, "channel-1", "rising");

    expect(update).toHaveBeenCalledWith({ where: { id: "channel-1" }, data: { channelTier: "rising" } });
  });
});

describe("listChannelsEligibleForScoring", () => {
  it("selects only channels with at least one video, oldest-enriched first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { channel: { findMany } } as unknown as PrismaClient;

    await listChannelsEligibleForScoring(db, 100);

    expect(findMany).toHaveBeenCalledWith({
      where: { videos: { some: {} } },
      orderBy: { lastEnrichedAt: { sort: "asc", nulls: "first" } },
      take: 100,
      select: { id: true, youtubeChannelId: true, channelTier: true, currentSubscriberCount: true, firstDiscoveredAt: true },
    });
  });
});

describe("listChannelVideosForScoring", () => {
  it("selects a channel's videos newest-first with view count and publish time", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    await listChannelVideosForScoring(db, "channel-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { channelId: "channel-1" },
      orderBy: { publishedAt: "desc" },
      select: { id: true, publishedAt: true, currentViewCount: true },
    });
  });
});

describe("listChannels", () => {
  it("runs the DISTINCT ON latest-score query with limit/offset and no tier filter", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listChannels(db, { limit: 20, offset: 0 });

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain("WHERE c.channel_tier");
    expect(params).toEqual([20, 0]);
  });

  it("adds the tier filter and its bound parameter when a tier is given", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listChannels(db, { tier: "breakout", limit: 20, offset: 0 });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("WHERE c.channel_tier = $3");
    expect(params).toEqual([20, 0, "breakout"]);
  });
});

describe("getChannelDetail", () => {
  it("returns the single matching row", async () => {
    const row = { id: "channel-1", youtubeChannelId: "ch1" };
    const queryRawUnsafe = vi.fn().mockResolvedValue([row]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    const result = await getChannelDetail(db, "channel-1");

    expect(queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("WHERE c.id = $1"), "channel-1");
    expect(result).toEqual(row);
  });

  it("returns null when no channel matches", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    const result = await getChannelDetail(db, "missing");

    expect(result).toBeNull();
  });
});
