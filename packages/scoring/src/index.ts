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
