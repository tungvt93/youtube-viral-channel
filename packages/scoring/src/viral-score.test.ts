import { describe, expect, it } from "vitest";
import { computeViralScore, type ViralScoreComponents } from "./viral-score";

const FULL: ViralScoreComponents = {
  vphPercentile: 80,
  growthPercentile: 60,
  outlierPercentile: 90,
  recencyScore100: 100,
  accelerationPercentile: 50,
};

describe("computeViralScore", () => {
  it("combines all five components with the PRD §8.3 weights when none are missing", () => {
    const result = computeViralScore(FULL);
    // 0.35*80 + 0.25*60 + 0.20*90 + 0.10*100 + 0.10*50 = 28 + 15 + 18 + 10 + 5 = 76
    expect(result.viralScore).toBeCloseTo(76);
    expect(result.dataConfidence).toBe(1);
  });

  it("re-normalizes remaining weights and reduces data_confidence instead of defaulting a missing metric to max", () => {
    const result = computeViralScore({ ...FULL, accelerationPercentile: null });
    // Remaining weight = 0.9; re-normalized: 0.35/0.9*80 + 0.25/0.9*60 + 0.20/0.9*90 + 0.10/0.9*100
    const expected = (0.35 * 80 + 0.25 * 60 + 0.2 * 90 + 0.1 * 100) / 0.9;
    expect(result.viralScore).toBeCloseTo(expected);
    expect(result.dataConfidence).toBeCloseTo(0.9);
    expect(result.breakdown.accelerationPercentile).toEqual({ weight: 0.1, value: null, contribution: null });
  });

  it("scores 0 with 0 data_confidence when every component is missing", () => {
    const result = computeViralScore({
      vphPercentile: null,
      growthPercentile: null,
      outlierPercentile: null,
      recencyScore100: null,
      accelerationPercentile: null,
    });
    expect(result.viralScore).toBe(0);
    expect(result.dataConfidence).toBe(0);
  });

  it("clamps the final score into [0, 100]", () => {
    const result = computeViralScore({ ...FULL, vphPercentile: 1000 });
    expect(result.viralScore).toBeLessThanOrEqual(100);
  });
});
