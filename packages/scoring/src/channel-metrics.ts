/**
 * PRD §9.2 channel-level metrics, feeding `computeChannelOutlierScore`
 * (§9.3). Each is pure and takes already-validated per-channel inputs —
 * the caller (channel-scoring processor) decides which videos/snapshots
 * belong to a channel and which qualify.
 */

import { computeRecencyScore, computeVph, median } from "./metrics";

/** Median of a channel's video view counts; null (not a throw) when the channel has no comparable videos yet. */
export function computeChannelMedianViews(viewCounts: number[]): number | null {
  return viewCounts.length > 0 ? median(viewCounts) : null;
}

export interface ChannelVphSnapshotPair {
  prevViews: number;
  currViews: number;
  prevAt: Date;
  currAt: Date;
}

/**
 * Median VPH across a channel's videos, each contributing its own latest
 * valid snapshot pair (caller picks that pair per video). Anomalous
 * (negative-delta) readings are excluded, same as the per-video Viral
 * Score's anomaly handling. Null when no video has a valid reading.
 */
export function computeChannelRecentMedianVph(pairs: ChannelVphSnapshotPair[]): number | null {
  const validVphs = pairs
    .map((pair) => computeVph(pair.prevViews, pair.currViews, pair.prevAt, pair.currAt))
    .filter((reading) => !reading.isAnomaly)
    .map((reading) => reading.vph);
  return validVphs.length > 0 ? median(validVphs) : null;
}

/**
 * Upload-consistency score, 0–100, from the gaps (in hours) between
 * consecutive uploads: `100 * exp(-coefficientOfVariation)`. Lower
 * variance between gaps (a steady cadence) scores higher; a channel with
 * wildly irregular gaps scores near 0. First-cut heuristic (plan Risks) —
 * needs at least 2 gaps (3 uploads) to be meaningful, so returns null below
 * that, same "insufficient data" convention as the other channel metrics.
 */
export function computeUploadConsistencyScore(uploadTimestamps: Date[]): number | null {
  if (uploadTimestamps.length < 3) {
    return null;
  }
  const sorted = [...uploadTimestamps].sort((a, b) => a.getTime() - b.getTime());
  const gapsHours: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gapsHours.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (60 * 60 * 1000));
  }
  const meanGap = gapsHours.reduce((sum, g) => sum + g, 0) / gapsHours.length;
  if (meanGap === 0) {
    return 100;
  }
  const variance = gapsHours.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / gapsHours.length;
  const coefficientOfVariation = Math.sqrt(variance) / meanGap;
  return 100 * Math.exp(-coefficientOfVariation);
}

/** PRD §9.2 channel recency: exp decay off the most recent upload, reusing the per-video recency curve but reported on the same 0–100 scale as the other channel-score components. */
export function computeChannelRecencyScore(ageHoursSinceLastUpload: number, tauHours: number): number {
  return computeRecencyScore(ageHoursSinceLastUpload, tauHours) * 100;
}
