import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { getLatestChannelScore, insertChannelScore } from "./channel-scores";

describe("insertChannelScore", () => {
  it("creates a new channel_scores row with the given fields", async () => {
    const create = vi.fn().mockResolvedValue({ id: "score-1" });
    const db = { channelScore: { create } } as unknown as PrismaClient;
    const computedAt = new Date("2026-11-05T00:00:00Z");

    await insertChannelScore(db, {
      channelId: "channel-1",
      computedAt,
      channelScore: 78,
      scoreBreakdown: { foo: "bar" },
      dataConfidence: 0.9,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        channelId: "channel-1",
        computedAt,
        channelScore: 78,
        scoreBreakdown: { foo: "bar" },
        dataConfidence: 0.9,
      },
    });
  });
});

describe("getLatestChannelScore", () => {
  it("finds the most recent score for the channel", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "score-1" });
    const db = { channelScore: { findFirst } } as unknown as PrismaClient;

    await getLatestChannelScore(db, "channel-1");

    expect(findFirst).toHaveBeenCalledWith({ where: { channelId: "channel-1" }, orderBy: { computedAt: "desc" } });
  });

  it("returns null when no score exists yet", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { channelScore: { findFirst } } as unknown as PrismaClient;

    const result = await getLatestChannelScore(db, "channel-1");

    expect(result).toBeNull();
  });
});
