/**
 * PRD §9.3 Channel Outlier Score. All four components are expected on a
 * 0–100 scale already (percentile ranks × 100, the two already-0-100
 * channel metrics) — this module only combines them, mirroring
 * `viral-score.ts`'s `computeViralScore` exactly (same missing-metric
 * re-normalization + `dataConfidence` rule, same shape of result).
 */

export interface ChannelOutlierScoreComponents {
  outlierVideoRatioPercentile: number | null;
  recentMedianVphPercentile: number | null;
  uploadConsistencyScore: number | null;
  channelRecencyScore: number | null;
}

const WEIGHTS: Record<keyof ChannelOutlierScoreComponents, number> = {
  outlierVideoRatioPercentile: 0.4,
  recentMedianVphPercentile: 0.3,
  uploadConsistencyScore: 0.2,
  channelRecencyScore: 0.1,
};

export interface ChannelOutlierScoreBreakdownEntry {
  weight: number;
  value: number | null;
  contribution: number | null;
}

export interface ChannelOutlierScoreResult {
  channelOutlierScore: number;
  breakdown: Record<keyof ChannelOutlierScoreComponents, ChannelOutlierScoreBreakdownEntry>;
  /** Fraction of total weight backed by an actual (non-null) metric — same rule as the per-video Viral Score's `dataConfidence`. */
  dataConfidence: number;
}

/**
 * PRD §9.3 rule, copied from `computeViralScore`: a missing component is
 * never scored as max — its weight is dropped and the remaining available
 * weights are re-normalized to sum to 1 for the score itself, while
 * `dataConfidence` reports how much of the original weight was actually
 * backed by data.
 */
export function computeChannelOutlierScore(components: ChannelOutlierScoreComponents): ChannelOutlierScoreResult {
  const keys = Object.keys(WEIGHTS) as (keyof ChannelOutlierScoreComponents)[];
  const availableWeight = keys.reduce((sum, key) => (components[key] !== null ? sum + WEIGHTS[key] : sum), 0);

  const breakdown = {} as Record<keyof ChannelOutlierScoreComponents, ChannelOutlierScoreBreakdownEntry>;
  let channelOutlierScore = 0;

  for (const key of keys) {
    const value = components[key];
    if (value === null) {
      breakdown[key] = { weight: WEIGHTS[key], value: null, contribution: null };
      continue;
    }
    const renormalizedWeight = availableWeight > 0 ? WEIGHTS[key] / availableWeight : 0;
    const contribution = renormalizedWeight * value;
    channelOutlierScore += contribution;
    breakdown[key] = { weight: WEIGHTS[key], value, contribution };
  }

  return {
    channelOutlierScore: Math.min(100, Math.max(0, channelOutlierScore)),
    breakdown,
    dataConfidence: availableWeight,
  };
}
