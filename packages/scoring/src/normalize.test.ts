import { describe, expect, it } from "vitest";
import { ageBucketLabel, logTransform, percentileRank, percentileValue } from "./normalize";

describe("logTransform", () => {
  it("is 0 at value 0", () => {
    expect(logTransform(0)).toBe(0);
  });

  it("clips negative inputs to 0 before taking the log", () => {
    expect(logTransform(-50)).toBe(0);
  });

  it("matches log(1 + value) for positive inputs", () => {
    expect(logTransform(9)).toBeCloseTo(Math.log(10));
  });
});

describe("percentileRank", () => {
  it("returns 0 for an empty cohort instead of throwing", () => {
    expect(percentileRank(10, [])).toBe(0);
  });

  it("ranks the highest value in the cohort near 1 (self-inclusive, so never exactly 1)", () => {
    expect(percentileRank(40, [10, 20, 30, 40])).toBe(0.875);
  });

  it("ranks the lowest value in the cohort near 0", () => {
    expect(percentileRank(10, [10, 20, 30, 40])).toBe(0.125);
  });

  it("splits ties evenly (mean rank)", () => {
    expect(percentileRank(10, [10, 10, 20, 30])).toBe(0.25);
  });
});

describe("percentileValue", () => {
  it("picks the nearest-rank value for a given percentile", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentileValue(sorted, 0.9)).toBe(90);
  });

  it("clamps to the last value when p is 1", () => {
    expect(percentileValue([5, 15, 25], 1)).toBe(25);
  });

  it("clamps to the first value when p is 0", () => {
    expect(percentileValue([5, 15, 25], 0)).toBe(5);
  });

  it("throws on an empty array", () => {
    expect(() => percentileValue([], 0.9)).toThrow();
  });
});

describe("ageBucketLabel", () => {
  it.each([
    [0.5, "<1d"],
    [1, "1-3d"],
    [2.9, "1-3d"],
    [3, "3-7d"],
    [6.9, "3-7d"],
    [7, "7-14d"],
    [13.9, "7-14d"],
    [14, "14d+"],
    [100, "14d+"],
  ])("buckets age %f days as %s", (ageDays, label) => {
    expect(ageBucketLabel(ageDays)).toBe(label);
  });
});
