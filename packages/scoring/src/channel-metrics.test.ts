import { describe, expect, it } from "vitest";
import {
  computeChannelMedianViews,
  computeChannelRecencyScore,
  computeChannelRecentMedianVph,
  computeUploadConsistencyScore,
} from "./channel-metrics";

describe("computeChannelMedianViews", () => {
  it("returns the median of the given view counts", () => {
    expect(computeChannelMedianViews([100, 300, 200])).toBe(200);
  });

  it("returns null for an empty channel (no comparable videos yet)", () => {
    expect(computeChannelMedianViews([])).toBeNull();
  });
});

describe("computeChannelRecentMedianVph", () => {
  it("computes the median VPH across multiple videos' latest snapshot pairs", () => {
    const pairs = [
      { prevViews: 1000, currViews: 1600, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
      { prevViews: 2000, currViews: 2600, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
      { prevViews: 500, currViews: 1700, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
    ];
    expect(computeChannelRecentMedianVph(pairs)).toBeCloseTo(100);
  });

  it("excludes anomalous (negative-delta) readings before taking the median", () => {
    const pairs = [
      { prevViews: 1000, currViews: 1600, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
      { prevViews: 5000, currViews: 4000, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
    ];
    expect(computeChannelRecentMedianVph(pairs)).toBeCloseTo(100);
  });

  it("returns null when every reading is anomalous or there are no pairs", () => {
    expect(computeChannelRecentMedianVph([])).toBeNull();
    const pairs = [
      { prevViews: 5000, currViews: 4000, prevAt: new Date("2026-11-01T00:00:00Z"), currAt: new Date("2026-11-01T06:00:00Z") },
    ];
    expect(computeChannelRecentMedianVph(pairs)).toBeNull();
  });
});

describe("computeUploadConsistencyScore", () => {
  it("scores a perfectly regular cadence at 100", () => {
    const uploads = [
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-03T00:00:00Z"),
      new Date("2026-11-05T00:00:00Z"),
      new Date("2026-11-07T00:00:00Z"),
    ];
    expect(computeUploadConsistencyScore(uploads)).toBeCloseTo(100);
  });

  it("scores an irregular cadence lower than a regular one", () => {
    const irregular = [
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-02T00:00:00Z"),
      new Date("2026-11-20T00:00:00Z"),
      new Date("2026-11-21T00:00:00Z"),
    ];
    expect(computeUploadConsistencyScore(irregular)).toBeLessThan(100);
    expect(computeUploadConsistencyScore(irregular)).toBeGreaterThanOrEqual(0);
  });

  it("returns null with fewer than 3 uploads (insufficient data)", () => {
    expect(computeUploadConsistencyScore([new Date("2026-11-01T00:00:00Z"), new Date("2026-11-03T00:00:00Z")])).toBeNull();
    expect(computeUploadConsistencyScore([])).toBeNull();
  });

  it("sorts out-of-order timestamps before computing gaps", () => {
    const outOfOrder = [
      new Date("2026-11-05T00:00:00Z"),
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-03T00:00:00Z"),
    ];
    expect(computeUploadConsistencyScore(outOfOrder)).toBeCloseTo(100);
  });
});

describe("computeChannelRecencyScore", () => {
  it("is 100 at age 0 and decays toward 0 as age grows, matching the per-video recency curve scaled to 100", () => {
    expect(computeChannelRecencyScore(0, 24)).toBeCloseTo(100);
    expect(computeChannelRecencyScore(24, 24)).toBeCloseTo(100 * Math.exp(-1));
    expect(computeChannelRecencyScore(240, 24)).toBeLessThan(0.1);
  });
});
