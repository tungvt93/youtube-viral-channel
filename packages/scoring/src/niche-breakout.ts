/**
 * Niche breakout signal: an absolute views-to-subscriber ratio (VSR) check,
 * scoped to small/mid channels. Distinct from `computeChannelOutlierMultiplier`
 * (PRD §8.1E), which ranks a video against its *own* channel's baseline (or
 * the subscriber-count fallback) and only ever surfaces as a cohort-relative
 * percentile — a huge channel can rank high there without ever being a
 * "niche" breakout. This is a product-owner decision, not PRD-specified; see
 * [[0003-niche-breakout-signal]].
 */

/** First-cut thresholds taken from the product owner's reference pipeline, not yet calibrated against real data. */
export const NICHE_BREAKOUT_MIN_SUBS = 1_000;
export const NICHE_BREAKOUT_MAX_SUBS = 50_000;
export const NICHE_BREAKOUT_VSR_THRESHOLD = 3.0;

/** Flat bonus added on top of the PRD §8.3 weighted score, clamped at 100 by the caller — first-cut, not yet calibrated. */
export const NICHE_BREAKOUT_SCORE_BONUS = 10;

export interface NicheBreakoutOptions {
  minSubs?: number;
  maxSubs?: number;
  vsrThreshold?: number;
}

export interface NicheBreakoutSignal {
  isBreakout: boolean;
  /** `views / subscriberCount`; reported whenever a subscriber count exists, even outside the niche range, for transparency in `scoreBreakdown`. */
  vsr: number | null;
}

export function computeNicheBreakoutSignal(
  currentViews: number,
  subscriberCount: number | null,
  options: NicheBreakoutOptions = {},
): NicheBreakoutSignal {
  if (subscriberCount === null || subscriberCount <= 0) {
    return { isBreakout: false, vsr: null };
  }

  const minSubs = options.minSubs ?? NICHE_BREAKOUT_MIN_SUBS;
  const maxSubs = options.maxSubs ?? NICHE_BREAKOUT_MAX_SUBS;
  const vsrThreshold = options.vsrThreshold ?? NICHE_BREAKOUT_VSR_THRESHOLD;

  const vsr = currentViews / subscriberCount;
  const inNicheRange = subscriberCount >= minSubs && subscriberCount <= maxSubs;
  return { isBreakout: inNicheRange && vsr >= vsrThreshold, vsr };
}
