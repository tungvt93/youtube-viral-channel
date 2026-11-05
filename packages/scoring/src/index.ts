export function packageMarker(): string {
  return "@yvi/scoring";
}

export {
  computeAcceleration,
  computeChannelOutlierMultiplier,
  computeGrowthPct,
  computeRecencyScore,
  computeVph,
  median,
} from "./metrics";
export type { ChannelOutlierResult, VphReading } from "./metrics";

export { ageBucketLabel, logTransform, percentileRank, percentileValue } from "./normalize";

export { computeViralScore } from "./viral-score";
export type { ViralScoreBreakdownEntry, ViralScoreComponents, ViralScoreResult } from "./viral-score";

export { meetsViralCandidateThreshold, nextScoreDrivenState } from "./lifecycle";
export type { CandidateThresholdInput, ScoreSignal } from "./lifecycle";

export {
  computeChannelMedianViews,
  computeChannelRecencyScore,
  computeChannelRecentMedianVph,
  computeUploadConsistencyScore,
} from "./channel-metrics";
export type { ChannelVphSnapshotPair } from "./channel-metrics";

export { computeChannelOutlierScore } from "./channel-score";
export type {
  ChannelOutlierScoreBreakdownEntry,
  ChannelOutlierScoreComponents,
  ChannelOutlierScoreResult,
} from "./channel-score";

export {
  CHANNEL_TIER_BREAKOUT_SCORE,
  CHANNEL_TIER_NEWCOMER_MAX_AGE_DAYS,
  CHANNEL_TIER_RISING_SCORE,
  nextChannelTier,
} from "./channel-tier";
export type { ChannelTier, ChannelTierInput } from "./channel-tier";
