import { describe, expect, it } from "vitest";
import { CHANNEL_TIER_BREAKOUT_SCORE, CHANNEL_TIER_RISING_SCORE, nextChannelTier } from "./channel-tier";

describe("nextChannelTier", () => {
  it("promotes to breakout once the score crosses the breakout threshold, regardless of current tier", () => {
    expect(
      nextChannelTier({ channelOutlierScore: CHANNEL_TIER_BREAKOUT_SCORE, isDeclining: false, channelAgeDays: 10, currentTier: "newcomer" }),
    ).toBe("breakout");
  });

  it("moves a declining breakout channel into cooling", () => {
    expect(
      nextChannelTier({ channelOutlierScore: CHANNEL_TIER_RISING_SCORE, isDeclining: true, channelAgeDays: 10, currentTier: "breakout" }),
    ).toBe("cooling");
  });

  it("holds a cooling channel in cooling until it recovers above the rising threshold without declining", () => {
    expect(
      nextChannelTier({ channelOutlierScore: CHANNEL_TIER_RISING_SCORE - 1, isDeclining: false, channelAgeDays: 10, currentTier: "cooling" }),
    ).toBe("cooling");
    expect(
      nextChannelTier({ channelOutlierScore: CHANNEL_TIER_RISING_SCORE, isDeclining: false, channelAgeDays: 10, currentTier: "cooling" }),
    ).toBe("rising");
  });

  it("assigns rising when the score is above the rising threshold but below breakout", () => {
    expect(
      nextChannelTier({ channelOutlierScore: CHANNEL_TIER_RISING_SCORE, isDeclining: false, channelAgeDays: 10, currentTier: "newcomer" }),
    ).toBe("rising");
  });

  it("graduates an old, low-scoring channel from newcomer to established", () => {
    expect(
      nextChannelTier({ channelOutlierScore: 10, isDeclining: false, channelAgeDays: 200, currentTier: "newcomer" }),
    ).toBe("established");
  });

  it("keeps a young, low-scoring channel as newcomer", () => {
    expect(
      nextChannelTier({ channelOutlierScore: 10, isDeclining: false, channelAgeDays: 5, currentTier: "newcomer" }),
    ).toBe("newcomer");
  });
});
