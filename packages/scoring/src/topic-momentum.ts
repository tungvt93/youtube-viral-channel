/**
 * PRD §10.6 Topic Momentum Score. All five components are expected on a
 * 0–100 scale already — this module only combines them, mirroring
 * `channel-score.ts`'s `computeChannelOutlierScore` exactly (same
 * missing-component re-normalization + `dataConfidence` rule, same shape of
 * result). The weights are a first cut (the PRD §10.6 text is not available
 * verbatim in this repo), chosen to favor a topic's view-velocity and
 * video-volume growth over its breadth/recency, same reasoning style as
 * `channel-tier.ts`'s "first cut, uncalibrated" thresholds — retune in one
 * place once real trend data exists.
 */

export interface TopicMomentumComponents {
  viewVelocityPercentile: number | null;
  videoCountGrowthPercentile: number | null;
  outlierRatioScore100: number | null;
  channelBreadthScore100: number | null;
  recencyScore100: number | null;
}

const WEIGHTS: Record<keyof TopicMomentumComponents, number> = {
  viewVelocityPercentile: 0.3,
  videoCountGrowthPercentile: 0.25,
  outlierRatioScore100: 0.2,
  channelBreadthScore100: 0.15,
  recencyScore100: 0.1,
};

export interface TopicMomentumBreakdownEntry {
  weight: number;
  value: number | null;
  contribution: number | null;
}

export interface TopicMomentumResult {
  momentumScore: number;
  breakdown: Record<keyof TopicMomentumComponents, TopicMomentumBreakdownEntry>;
  /** Fraction of total weight backed by an actual (non-null) metric — same rule as the per-video Viral Score's `dataConfidence`. */
  dataConfidence: number;
  /** Separate from `dataConfidence`: how much the *volume of observed videos* (not missing metrics) should discount trust in this window's numbers — see `sampleConfidenceFromVideoCount`. */
  sampleConfidence: number;
}

/**
 * First-cut, task-local thresholds: a window with at least
 * `SAMPLE_CONFIDENCE_FULL_AT_VIDEO_COUNT` observed videos is treated as fully
 * confident; below that, confidence scales down linearly to 0 at a single
 * observed video. Uncalibrated against real trend data — flagged in the
 * Phase 5 plan Risks section.
 */
const SAMPLE_CONFIDENCE_FULL_AT_VIDEO_COUNT = 20;

export function sampleConfidenceFromVideoCount(uniqueVideoCount: number): number {
  return Math.max(0, Math.min(1, uniqueVideoCount / SAMPLE_CONFIDENCE_FULL_AT_VIDEO_COUNT));
}

/**
 * PRD §10.6 rule, copied from `computeChannelOutlierScore`: a missing
 * component is never scored as max — its weight is dropped and the
 * remaining available weights are re-normalized to sum to 1 for the score
 * itself, while `dataConfidence` reports how much of the original weight was
 * actually backed by data.
 */
export function computeTopicMomentum(
  components: TopicMomentumComponents,
  uniqueVideoCount: number,
): TopicMomentumResult {
  const keys = Object.keys(WEIGHTS) as (keyof TopicMomentumComponents)[];
  const availableWeight = keys.reduce((sum, key) => (components[key] !== null ? sum + WEIGHTS[key] : sum), 0);

  const breakdown = {} as Record<keyof TopicMomentumComponents, TopicMomentumBreakdownEntry>;
  let momentumScore = 0;

  for (const key of keys) {
    const value = components[key];
    if (value === null) {
      breakdown[key] = { weight: WEIGHTS[key], value: null, contribution: null };
      continue;
    }
    const renormalizedWeight = availableWeight > 0 ? WEIGHTS[key] / availableWeight : 0;
    const contribution = renormalizedWeight * value;
    momentumScore += contribution;
    breakdown[key] = { weight: WEIGHTS[key], value, contribution };
  }

  return {
    momentumScore: Math.min(100, Math.max(0, momentumScore)),
    breakdown,
    dataConfidence: availableWeight,
    sampleConfidence: sampleConfidenceFromVideoCount(uniqueVideoCount),
  };
}
