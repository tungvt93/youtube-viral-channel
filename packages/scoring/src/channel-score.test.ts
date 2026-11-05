import { describe, expect, it } from "vitest";
import { computeChannelOutlierScore, type ChannelOutlierScoreComponents } from "./channel-score";

const FULL: ChannelOutlierScoreComponents = {
  outlierVideoRatioPercentile: 80,
  recentMedianVphPercentile: 60,
  uploadConsistencyScore: 90,
  channelRecencyScore: 100,
};

describe("computeChannelOutlierScore", () => {
  it("combines all four components with the PRD §9.3 weights when none are missing", () => {
    const result = computeChannelOutlierScore(FULL);
    // 0.40*80 + 0.30*60 + 0.20*90 + 0.10*100 = 32 + 18 + 18 + 10 = 78
    expect(result.channelOutlierScore).toBeCloseTo(78);
    expect(result.dataConfidence).toBeCloseTo(1);
  });

  it("re-normalizes remaining weights and reduces dataConfidence instead of defaulting a missing component to max", () => {
    const result = computeChannelOutlierScore({ ...FULL, channelRecencyScore: null });
    // Remaining weight = 0.9; re-normalized: 0.40/0.9*80 + 0.30/0.9*60 + 0.20/0.9*90
    const expected = (0.4 * 80 + 0.3 * 60 + 0.2 * 90) / 0.9;
    expect(result.channelOutlierScore).toBeCloseTo(expected);
    expect(result.dataConfidence).toBeCloseTo(0.9);
    expect(result.breakdown.channelRecencyScore).toEqual({ weight: 0.1, value: null, contribution: null });
  });

  it("scores 0 with 0 dataConfidence when every component is missing", () => {
    const result = computeChannelOutlierScore({
      outlierVideoRatioPercentile: null,
      recentMedianVphPercentile: null,
      uploadConsistencyScore: null,
      channelRecencyScore: null,
    });
    expect(result.channelOutlierScore).toBe(0);
    expect(result.dataConfidence).toBe(0);
  });

  it("clamps the final score into [0, 100]", () => {
    const result = computeChannelOutlierScore({ ...FULL, outlierVideoRatioPercentile: 1000 });
    expect(result.channelOutlierScore).toBeLessThanOrEqual(100);
  });
});
