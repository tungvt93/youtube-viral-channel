/**
 * PRD §10.5 per-(market, topic) window metrics, feeding `computeTopicMomentum`
 * (§10.6). Each is pure and takes already-validated per-group inputs — the
 * caller (`topic-trend-aggregation` processor) decides which videos belong to
 * a (market, topic) window.
 */

import { median } from "./metrics";
import { percentileValue } from "./normalize";

/**
 * View velocity since publish, not between two snapshots (plan Risk:
 * `listObservedTopicVideos` carries only one time point per video, unlike
 * the §8.1B snapshot-pair `computeVph`) — a documented first-cut
 * simplification distinct from video-scoring's snapshot-delta VPH.
 */
export function computeVphSincePublish(currentViews: number, ageHoursSincePublished: number): number {
  return currentViews / Math.max(ageHoursSincePublished, 1);
}

/** Task-local outlier rule, same multiplier-over-median shape as channel-scoring's `CHANNEL_OUTLIER_MULTIPLIER_THRESHOLD`, applied to topic-VPH instead of channel view counts. */
export const TOPIC_OUTLIER_VPH_MULTIPLIER = 2;

export interface TopicVphSummary {
  medianVph: number;
  p90Vph: number;
  outlierVideoCount: number;
}

/** Median/p90/outlier-count of a window's per-video VPH readings; zeroed out (not null) for an empty sample, since `median_vph`/`p90_vph` are non-nullable columns. */
export function summarizeTopicVph(vphValues: number[]): TopicVphSummary {
  if (vphValues.length === 0) {
    return { medianVph: 0, p90Vph: 0, outlierVideoCount: 0 };
  }
  const medianVph = median(vphValues);
  const sortedAscending = [...vphValues].sort((a, b) => a - b);
  const p90Vph = percentileValue(sortedAscending, 0.9);
  const outlierVideoCount = medianVph > 0 ? vphValues.filter((vph) => vph > TOPIC_OUTLIER_VPH_MULTIPLIER * medianVph).length : 0;
  return { medianVph, p90Vph, outlierVideoCount };
}
