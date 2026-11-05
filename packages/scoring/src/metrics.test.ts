import { describe, expect, it } from "vitest";
import {
  computeAcceleration,
  computeChannelOutlierMultiplier,
  computeGrowthPct,
  computeRecencyScore,
  computeVph,
  median,
} from "./metrics";

describe("computeVph", () => {
  it("computes views-per-hour over the interval", () => {
    const result = computeVph(1000, 4600, new Date("2026-11-05T00:00:00Z"), new Date("2026-11-05T06:00:00Z"));
    expect(result).toEqual({ vph: 600, isAnomaly: false });
  });

  it("flags a negative delta as an anomaly without discarding the value", () => {
    const result = computeVph(5000, 4000, new Date("2026-11-05T00:00:00Z"), new Date("2026-11-05T06:00:00Z"));
    expect(result.isAnomaly).toBe(true);
    expect(result.vph).toBeLessThan(0);
  });
});

describe("computeGrowthPct", () => {
  it("computes percentage growth relative to the earlier count", () => {
    expect(computeGrowthPct(1000, 1500)).toBeCloseTo(50);
  });

  it("floors the denominator at 1 to avoid dividing by zero", () => {
    expect(computeGrowthPct(0, 10)).toBeCloseTo(1000);
  });
});

describe("computeAcceleration", () => {
  it("returns null when there is no previous interval", () => {
    expect(computeAcceleration(600, null)).toBeNull();
  });

  it("computes the relative change between two VPH readings", () => {
    expect(computeAcceleration(900, 600)).toBeCloseTo(0.5);
  });

  it("floors the denominator at epsilon instead of dividing by zero", () => {
    expect(computeAcceleration(10, 0)).toBeCloseTo(10);
  });
});

describe("computeRecencyScore", () => {
  it("is 1 at age 0 and decays toward 0 as age grows", () => {
    expect(computeRecencyScore(0, 24)).toBeCloseTo(1);
    expect(computeRecencyScore(24, 24)).toBeCloseTo(Math.exp(-1));
    expect(computeRecencyScore(240, 24)).toBeLessThan(0.001);
  });
});

describe("computeChannelOutlierMultiplier", () => {
  it("uses the channel median when available", () => {
    const result = computeChannelOutlierMultiplier(30000, 10000, 5000);
    expect(result).toEqual({ multiplier: 3, usedFallback: false });
  });

  it("falls back to views-over-subscribers when no median is available", () => {
    const result = computeChannelOutlierMultiplier(30000, null, 10000);
    expect(result).toEqual({ multiplier: 3, usedFallback: true });
  });

  it("floors both the median and the subscriber count to avoid divide-by-zero blowups", () => {
    expect(computeChannelOutlierMultiplier(500, 1, null)).toEqual({ multiplier: 5, usedFallback: false });
    expect(computeChannelOutlierMultiplier(500, null, 1)).toEqual({ multiplier: 5, usedFallback: true });
  });

  it("returns null when neither a median nor a subscriber count is available", () => {
    expect(computeChannelOutlierMultiplier(30000, null, null)).toBeNull();
  });
});

describe("median", () => {
  it("averages the two middle values for an even-length sample", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the middle value for an odd-length sample", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("throws on an empty sample", () => {
    expect(() => median([])).toThrow();
  });
});
