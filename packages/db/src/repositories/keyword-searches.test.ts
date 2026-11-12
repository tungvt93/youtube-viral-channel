import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  ackKeywordSearch,
  createKeywordSearch,
  finishKeywordSearch,
  listKeywordSearchesWithMarket,
  markKeywordSearchRunning,
} from "./keyword-searches";

describe("createKeywordSearch", () => {
  it("creates a row with status queued and includes market", async () => {
    const input = { query: "best budget cameras", marketId: "market-1", language: "en" };
    const created = { id: "search-1", status: "queued", ...input, market: { id: "market-1" } };
    const create = vi.fn().mockResolvedValue(created);
    const db = { keywordSearch: { create } } as unknown as PrismaClient;

    await expect(createKeywordSearch(db, input)).resolves.toEqual(created);

    expect(create).toHaveBeenCalledWith({ data: input, include: { market: true } });
  });
});

describe("listKeywordSearchesWithMarket", () => {
  it("orders by createdAt desc and applies the limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { keywordSearch: { findMany } } as unknown as PrismaClient;

    await listKeywordSearchesWithMarket(db, {}, 20);

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { market: true },
    });
  });

  it("with unseenOnly filters to completed/failed rows with acknowledgedAt null", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { keywordSearch: { findMany } } as unknown as PrismaClient;

    await listKeywordSearchesWithMarket(db, { unseenOnly: true }, 20);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: { in: ["completed", "failed"] }, acknowledgedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { market: true },
    });
  });
});

describe("markKeywordSearchRunning", () => {
  it("sets status to running", async () => {
    const updated = { id: "search-1", status: "running" };
    const update = vi.fn().mockResolvedValue(updated);
    const db = { keywordSearch: { update } } as unknown as PrismaClient;

    await expect(markKeywordSearchRunning(db, "search-1")).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({ where: { id: "search-1" }, data: { status: "running" } });
  });
});

describe("finishKeywordSearch", () => {
  it("writes status, counts, errorMessage, and finishedAt", async () => {
    const finishedAt = new Date("2026-11-06T12:05:00.000Z");
    const input = {
      id: "search-1",
      status: "completed" as const,
      videosFound: 40,
      recommendedVideosFound: 12,
      errorMessage: null,
      finishedAt,
    };
    const updated = { ...input };
    const update = vi.fn().mockResolvedValue(updated);
    const db = { keywordSearch: { update } } as unknown as PrismaClient;

    await expect(finishKeywordSearch(db, input)).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({
      where: { id: "search-1" },
      data: {
        status: "completed",
        videosFound: 40,
        recommendedVideosFound: 12,
        errorMessage: null,
        finishedAt,
      },
    });
  });
});

describe("ackKeywordSearch", () => {
  it("sets acknowledgedAt when null", async () => {
    const now = new Date("2026-11-06T13:00:00.000Z");
    const existing = { id: "search-1", acknowledgedAt: null };
    const updated = { id: "search-1", acknowledgedAt: now };
    const findUnique = vi.fn().mockResolvedValue(existing);
    const update = vi.fn().mockResolvedValue(updated);
    const db = { keywordSearch: { findUnique, update } } as unknown as PrismaClient;

    await expect(ackKeywordSearch(db, "search-1", now)).resolves.toEqual(updated);

    expect(update).toHaveBeenCalledWith({ where: { id: "search-1" }, data: { acknowledgedAt: now } });
  });

  it("is idempotent: a second call does not overwrite the original acknowledgedAt", async () => {
    const originalAckAt = new Date("2026-11-06T13:00:00.000Z");
    const laterNow = new Date("2026-11-06T14:00:00.000Z");
    const existing = { id: "search-1", acknowledgedAt: originalAckAt };
    const findUnique = vi.fn().mockResolvedValue(existing);
    const update = vi.fn();
    const db = { keywordSearch: { findUnique, update } } as unknown as PrismaClient;

    await expect(ackKeywordSearch(db, "search-1", laterNow)).resolves.toEqual(existing);

    expect(update).not.toHaveBeenCalled();
  });

  it("throws a clear error instead of crashing on an unknown id", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const db = { keywordSearch: { findUnique, update } } as unknown as PrismaClient;

    await expect(ackKeywordSearch(db, "missing", new Date())).rejects.toThrow("KeywordSearch not found: missing");

    expect(update).not.toHaveBeenCalled();
  });
});
