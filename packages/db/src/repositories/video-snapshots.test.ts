import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { insertVideoSnapshot, listRecentValidSnapshots, listVideoSnapshots } from "./video-snapshots";

describe("insertVideoSnapshot", () => {
  it("creates a VideoSnapshot row with the given counts and fetch status", async () => {
    const create = vi.fn().mockResolvedValue({ id: 1n });
    const db = { videoSnapshot: { create } } as unknown as PrismaClient;
    const collectedAt = new Date("2026-11-05T12:00:00Z");

    await insertVideoSnapshot(db, {
      videoId: "video-1",
      collectedAt,
      viewCount: 1000n,
      likeCount: 10n,
      commentCount: null,
      fetchStatus: "ok",
      source: "videos.list",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        videoId: "video-1",
        collectedAt,
        viewCount: 1000n,
        likeCount: 10n,
        commentCount: null,
        fetchStatus: "ok",
        source: "videos.list",
      },
    });
  });
});

describe("listVideoSnapshots", () => {
  it("queries by videoId, newest first, bounded by limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { videoSnapshot: { findMany } } as unknown as PrismaClient;

    await listVideoSnapshots(db, "video-1", 100);

    expect(findMany).toHaveBeenCalledWith({
      where: { videoId: "video-1" },
      orderBy: { collectedAt: "desc" },
      take: 100,
    });
  });
});

describe("listRecentValidSnapshots", () => {
  it("queries only fetchStatus ok snapshots for the whole batch, grouped-friendly ordering", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { videoSnapshot: { findMany } } as unknown as PrismaClient;

    await listRecentValidSnapshots(db, ["video-1", "video-2"]);

    expect(findMany).toHaveBeenCalledWith({
      where: { videoId: { in: ["video-1", "video-2"] }, fetchStatus: "ok" },
      orderBy: [{ videoId: "asc" }, { collectedAt: "desc" }],
    });
  });
});
