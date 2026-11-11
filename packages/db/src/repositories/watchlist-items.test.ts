import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { addToWatchlist, isWatchlisted, removeFromWatchlist } from "./watchlist-items";

const input = { userId: "user-1", entityType: "video", entityId: "video-1" };

describe("addToWatchlist", () => {
  it("upserts on the (userId, entityType, entityId) unique key", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "wi-1", ...input });
    const db = { watchlistItem: { upsert } } as unknown as PrismaClient;

    await addToWatchlist(db, input);

    expect(upsert).toHaveBeenCalledWith({
      where: { userId_entityType_entityId: input },
      create: input,
      update: {},
    });
  });
});

describe("removeFromWatchlist", () => {
  it("deletes matching rows without erroring when none exist", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = { watchlistItem: { deleteMany } } as unknown as PrismaClient;

    await removeFromWatchlist(db, input);

    expect(deleteMany).toHaveBeenCalledWith({ where: input });
  });
});

describe("isWatchlisted", () => {
  it("returns true when a matching row exists", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "wi-1", ...input });
    const db = { watchlistItem: { findUnique } } as unknown as PrismaClient;

    await expect(isWatchlisted(db, input)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId_entityType_entityId: input } });
  });

  it("returns false when no row matches", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = { watchlistItem: { findUnique } } as unknown as PrismaClient;

    await expect(isWatchlisted(db, input)).resolves.toBe(false);
  });
});
