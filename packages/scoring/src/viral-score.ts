/**
 * PRD §8.3 Viral Score. All five components are expected on a 0–100 scale
 * already (percentile ranks × 100, recency × 100) — this module only
 * combines them; `normalize.ts`/`metrics.ts` produce the inputs.
 */

export interface ViralScoreComponents {
  vphPercentile: number | null;
  growthPercentile: number | null;
  outlierPercentile: number | null;
  recencyScore100: number | null;
  accelerationPercentile: number | null;
}

const WEIGHTS: Record<keyof ViralScoreComponents, number> = {
  vphPercentile: 0.35,
  growthPercentile: 0.25,
  outlierPercentile: 0.2,
  recencyScore100: 0.1,
  accelerationPercentile: 0.1,
};

export interface ViralScoreBreakdownEntry {
  weight: number;
  value: number | null;
  contribution: number | null;
}

export interface ViralScoreResult {
  viralScore: number;
  breakdown: Record<keyof ViralScoreComponents, ViralScoreBreakdownEntry>;
  /** Fraction of total weight backed by an actual (non-null) metric — PRD §8.3: "giảm data_confidence" when a metric is missing, never a guessed max score. */
  dataConfidence: number;
}

/**
 * PRD §8.3 rule: a missing metric is never scored as max — its weight is
 * dropped and the remaining available weights are re-normalized to sum to 1
 * for the score itself, while `dataConfidence` reports how much of the
 * original weight was actually backed by data.
 */
export function computeViralScore(components: ViralScoreComponents): ViralScoreResult {
  const keys = Object.keys(WEIGHTS) as (keyof ViralScoreComponents)[];
  const availableWeight = keys.reduce((sum, key) => (components[key] !== null ? sum + WEIGHTS[key] : sum), 0);

  const breakdown = {} as Record<keyof ViralScoreComponents, ViralScoreBreakdownEntry>;
  let viralScore = 0;

  for (const key of keys) {
    const value = components[key];
    if (value === null) {
      breakdown[key] = { weight: WEIGHTS[key], value: null, contribution: null };
      continue;
    }
    const renormalizedWeight = availableWeight > 0 ? WEIGHTS[key] / availableWeight : 0;
    const contribution = renormalizedWeight * value;
    viralScore += contribution;
    breakdown[key] = { weight: WEIGHTS[key], value, contribution };
  }

  return {
    viralScore: Math.min(100, Math.max(0, viralScore)),
    breakdown,
    dataConfidence: availableWeight,
  };
}
