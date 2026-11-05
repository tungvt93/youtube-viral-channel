/**
 * PRD §8.1 per-metric functions. Each is pure and takes already-validated
 * inputs (caller picks which snapshots/videos qualify) — anomaly/missing-data
 * handling lives in the caller (the `video-scoring` processor), not here.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

export interface VphReading {
  /** Views per hour for the interval. Still returned (even negative) when `isAnomaly` is true — the caller decides whether to use it. */
  vph: number;
  /** PRD §8.1B: a negative view delta is a correction/anomaly, not real negative growth. */
  isAnomaly: boolean;
}

/** PRD §8.1B: `VPH = (V(t2) - V(t1)) / hours`. `t2` must be after `t1`. */
export function computeVph(prevViews: number, currViews: number, prevAt: Date, currAt: Date): VphReading {
  const hours = (currAt.getTime() - prevAt.getTime()) / MS_PER_HOUR;
  const delta = currViews - prevViews;
  return { vph: delta / hours, isAnomaly: delta < 0 };
}

/** PRD §8.1C: `GrowthPct = (V(t2) - V(t1)) / max(V(t1), 1) * 100`. */
export function computeGrowthPct(prevViews: number, currViews: number): number {
  return ((currViews - prevViews) / Math.max(prevViews, 1)) * 100;
}

/**
 * PRD §8.1D: `Acceleration = (VPHcurrent - VPHprevious) / max(VPHprevious, epsilon)`.
 * Returns `null` when there is no previous interval — never defaults to 0
 * (PRD: "không mặc định bằng 0").
 */
export function computeAcceleration(vphCurrent: number, vphPrevious: number | null, epsilon = 1): number | null {
  if (vphPrevious === null) {
    return null;
  }
  return (vphCurrent - vphPrevious) / Math.max(vphPrevious, epsilon);
}

/** PRD §8.1F: `RecencyScore = exp(-ageHours / tau)`, 0–1. */
export function computeRecencyScore(ageHours: number, tauHours: number): number {
  return Math.exp(-ageHours / tauHours);
}

export interface ChannelOutlierResult {
  multiplier: number;
  /** True when no channel median was available and the decision-0002 `views / max(subscribers, 100)` fallback was used instead. */
  usedFallback: boolean;
}

/**
 * PRD §8.1E. `channelMedianViews` is null when the channel doesn't have
 * enough comparable videos (caller decides the threshold, e.g. <5) — in that
 * case falls back to `views / max(subscriberCount, floor)`
 * ([[0002-no-vendor-outlier-finder]]). Returns null when neither a median
 * nor a subscriber count is available at all.
 */
export function computeChannelOutlierMultiplier(
  currentViews: number,
  channelMedianViews: number | null,
  subscriberCount: number | null,
  floor = 100,
): ChannelOutlierResult | null {
  if (channelMedianViews !== null) {
    return { multiplier: currentViews / Math.max(channelMedianViews, floor), usedFallback: false };
  }
  if (subscriberCount !== null) {
    return { multiplier: currentViews / Math.max(subscriberCount, floor), usedFallback: true };
  }
  return null;
}

/** Median of a numeric sample; caller filters out nulls/self before calling. */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("median() requires at least one value");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
