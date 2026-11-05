import { describe, expect, it } from "vitest";
import { computeVphSincePublish, summarizeTopicVph } from "./topic-metrics";

describe("computeVphSincePublish", () => {
  it("divides current views by age in hours", () => {
    expect(computeVphSincePublish(2400, 24)).toBeCloseTo(100);
  });

  it("floors the age at 1 hour to avoid dividing by (near) zero for a just-published video", () => {
    expect(computeVphSincePublish(50, 0.1)).toBeCloseTo(50);
  });
});

describe("summarizeTopicVph", () => {
  it("returns zeroed-out values for an empty sample", () => {
    expect(summarizeTopicVph([])).toEqual({ medianVph: 0, p90Vph: 0, outlierVideoCount: 0 });
  });

  it("computes median, p90, and outlier count against the sample's own median", () => {
    const result = summarizeTopicVph([10, 20, 30, 40, 100]);
    expect(result.medianVph).toBe(30);
    expect(result.p90Vph).toBe(100);
    // 2x median (60) is outranked only by 100.
    expect(result.outlierVideoCount).toBe(1);
  });

  it("reports zero outliers when every reading is within 2x the median", () => {
    const result = summarizeTopicVph([10, 12, 14, 16, 18]);
    expect(result.outlierVideoCount).toBe(0);
  });
});
