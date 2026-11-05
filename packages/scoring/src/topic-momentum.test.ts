import { describe, expect, it } from "vitest";
import { computeTopicMomentum, sampleConfidenceFromVideoCount, type TopicMomentumComponents } from "./topic-momentum";

const FULL: TopicMomentumComponents = {
  viewVelocityPercentile: 80,
  videoCountGrowthPercentile: 60,
  outlierRatioScore100: 90,
  channelBreadthScore100: 40,
  recencyScore100: 100,
};

describe("computeTopicMomentum", () => {
  it("combines all five components with the documented weights when none are missing", () => {
    const result = computeTopicMomentum(FULL, 20);
    // 0.30*80 + 0.25*60 + 0.20*90 + 0.15*40 + 0.10*100 = 24 + 15 + 18 + 6 + 10 = 73
    expect(result.momentumScore).toBeCloseTo(73);
    expect(result.dataConfidence).toBeCloseTo(1);
  });

  it("re-normalizes remaining weights and reduces dataConfidence instead of defaulting a missing component to max", () => {
    const result = computeTopicMomentum({ ...FULL, channelBreadthScore100: null }, 20);
    const expected = (0.3 * 80 + 0.25 * 60 + 0.2 * 90 + 0.1 * 100) / 0.85;
    expect(result.momentumScore).toBeCloseTo(expected);
    expect(result.dataConfidence).toBeCloseTo(0.85);
    expect(result.breakdown.channelBreadthScore100).toEqual({ weight: 0.15, value: null, contribution: null });
  });

  it("scores 0 with 0 dataConfidence when every component is missing", () => {
    const result = computeTopicMomentum(
      {
        viewVelocityPercentile: null,
        videoCountGrowthPercentile: null,
        outlierRatioScore100: null,
        channelBreadthScore100: null,
        recencyScore100: null,
      },
      20,
    );
    expect(result.momentumScore).toBe(0);
    expect(result.dataConfidence).toBe(0);
  });

  it("clamps the final score into [0, 100]", () => {
    const result = computeTopicMomentum({ ...FULL, viewVelocityPercentile: 1000 }, 20);
    expect(result.momentumScore).toBeLessThanOrEqual(100);
  });

  it("reports full sampleConfidence at/above the full-confidence video count", () => {
    const result = computeTopicMomentum(FULL, 20);
    expect(result.sampleConfidence).toBe(1);
  });

  it("reports a reduced sampleConfidence below the full-confidence video count", () => {
    const result = computeTopicMomentum(FULL, 10);
    expect(result.sampleConfidence).toBeCloseTo(0.5);
  });
});

describe("sampleConfidenceFromVideoCount", () => {
  it("clamps to [0, 1]", () => {
    expect(sampleConfidenceFromVideoCount(0)).toBe(0);
    expect(sampleConfidenceFromVideoCount(1000)).toBe(1);
  });
});
