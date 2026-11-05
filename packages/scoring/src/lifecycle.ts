import type { MonitoringState } from "@yvi/shared";

/** PRD §8.4 candidate thresholds — all four must hold. */
export interface CandidateThresholdInput {
  vph: number;
  /** The comparison cohort's p90 VPH (PRD §8.4: "VPH > market/topic p90"; this phase's cohort is format + age bucket, see plan Decisions). */
  vphP90: number;
  outlierMultiplier: number | null;
  validSnapshotCount: number;
  ageDays: number;
}

export function meetsViralCandidateThreshold(input: CandidateThresholdInput): boolean {
  return (
    input.vph > input.vphP90 &&
    input.outlierMultiplier !== null &&
    input.outlierMultiplier >= 3 &&
    input.validSnapshotCount >= 2 &&
    input.ageDays < 14
  );
}

export interface ScoreSignal {
  meetsHighSignalThreshold: boolean;
  /** PRD §8.5 "Cooling: VPH giảm liên tục" — this phase uses a single-interval decline (see plan Risks). */
  isDeclining: boolean;
}

/**
 * Score-driven transitions (PRD §8.5), distinct from
 * `@yvi/shared`'s snapshot-outcome `nextMonitoringState`: `candidate`
 * (not yet promoted to `monitoring` by a successful snapshot),
 * `unavailable`, and `archived` are left untouched — this phase doesn't own
 * those transitions. `monitoring`/`high_signal`/`cooling` are the only
 * states this function actually moves between.
 */
export function nextScoreDrivenState(current: MonitoringState, signal: ScoreSignal): MonitoringState {
  if (current !== "monitoring" && current !== "high_signal" && current !== "cooling") {
    return current;
  }
  if (signal.meetsHighSignalThreshold) {
    return "high_signal";
  }
  if (current === "high_signal" && signal.isDeclining) {
    return "cooling";
  }
  if (current === "cooling" && !signal.isDeclining) {
    return "high_signal";
  }
  return current;
}
