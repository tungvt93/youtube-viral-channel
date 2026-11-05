import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { insertVideoScore, listVideoScores } from "./video-scores";

describe("insertVideoScore", () => {
  it("creates a VideoScore row with the given score and breakdown", async () => {
    const create = vi.fn().mockResolvedValue({ id: "score-1" });
    const db = { videoScore: { create } } as unknown as PrismaClient;
    const computedAt = new Date("2026-11-05T12:00:00Z");
    const scoreBreakdown = { vphPercentile: { weight: 0.35, value: 80, contribution: 28 } };

    await insertVideoScore(db, { videoId: "video-1", computedAt, viralScore: 72.5, scoreBreakdown, dataConfidence: 0.9 });

    expect(create).toHaveBeenCalledWith({
      data: { videoId: "video-1", computedAt, viralScore: 72.5, scoreBreakdown, dataConfidence: 0.9 },
    });
  });
});

describe("listVideoScores", () => {
  it("queries by videoId, newest first, bounded by limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { videoScore: { findMany } } as unknown as PrismaClient;

    await listVideoScores(db, "video-1", 500);

    expect(findMany).toHaveBeenCalledWith({
      where: { videoId: "video-1" },
      orderBy: { computedAt: "desc" },
      take: 500,
    });
  });
});
