/**
 * PRD §9.4 channel tiers — internal analytical labels, not an official
 * YouTube classification. Thresholds are a first cut (plan Risks: "Channel
 * Outlier Score weights/tier thresholds are a first cut, uncalibrated
 * against real data"), named here rather than scattered inline so they can
 * be retuned in one place once real data exists.
 */

export type ChannelTier = "newcomer" | "rising" | "breakout" | "established" | "cooling";

/** Channel Outlier Score at/above this is a breakout, regardless of current tier. */
export const CHANNEL_TIER_BREAKOUT_SCORE = 75;
/** Channel Outlier Score at/above this (but below breakout) is rising. */
export const CHANNEL_TIER_RISING_SCORE = 50;
/** A channel older than this with no rising/breakout signal graduates out of `newcomer` into `established`. */
export const CHANNEL_TIER_NEWCOMER_MAX_AGE_DAYS = 90;

export interface ChannelTierInput {
  channelOutlierScore: number;
  /** True when this run's score is lower than the channel's previous score — same "declining" signal as the per-video lifecycle's `isDeclining`. */
  isDeclining: boolean;
  channelAgeDays: number;
  currentTier: ChannelTier;
}

/**
 * Score-driven tier transition, mirroring `nextScoreDrivenState`'s shape:
 * a state machine driven by score thresholds plus a decline signal, not a
 * one-shot classification from the score alone — so a channel that has
 * earned `breakout` cools into `cooling` rather than snapping straight back
 * to `newcomer`/`rising` the moment its score dips.
 */
export function nextChannelTier(input: ChannelTierInput): ChannelTier {
  if (input.channelOutlierScore >= CHANNEL_TIER_BREAKOUT_SCORE) {
    return "breakout";
  }
  if (input.currentTier === "breakout" && input.isDeclining) {
    return "cooling";
  }
  if (input.currentTier === "cooling") {
    if (input.channelOutlierScore >= CHANNEL_TIER_RISING_SCORE && !input.isDeclining) {
      return "rising";
    }
    return "cooling";
  }
  if (input.channelOutlierScore >= CHANNEL_TIER_RISING_SCORE) {
    return "rising";
  }
  if (input.channelAgeDays > CHANNEL_TIER_NEWCOMER_MAX_AGE_DAYS) {
    return "established";
  }
  return "newcomer";
}
