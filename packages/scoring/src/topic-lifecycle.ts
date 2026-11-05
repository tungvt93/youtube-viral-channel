/**
 * PRD §10.7 Topic Lifecycle state machine. The exact state set is given
 * verbatim by `TrendSnapshot.lifecycleState`'s schema doc comment
 * (`apps/api/prisma/schema.prisma`): candidate/emerging/accelerating/
 * trending/peaking/declining — that comment is the repository authority for
 * this externally observable policy, so the thresholds below are a first
 * cut (same status as `channel-tier.ts`'s "first cut, uncalibrated" tier
 * thresholds) but the six state *names* are not. The shape (score
 * thresholds plus a decline-hysteresis state) mirrors `nextChannelTier`
 * exactly, per the Phase 5 plan's explicit instruction to reuse that
 * template — `accelerating`/`trending` play the role of two ascending bands
 * where channel-tier has only one (`rising`), and `declining` is the floor
 * state with no further state below it, same as channel-tier's `cooling`.
 */

export type TopicLifecycleState = "candidate" | "emerging" | "accelerating" | "trending" | "peaking" | "declining";

/** Momentum score at/above this is peaking, regardless of current state. */
export const TOPIC_LIFECYCLE_PEAKING_SCORE = 75;
/** Momentum score at/above this (but below peaking) is trending. */
export const TOPIC_LIFECYCLE_TRENDING_SCORE = 60;
/** Momentum score at/above this (but below trending) is accelerating; also the recovery threshold out of declining. */
export const TOPIC_LIFECYCLE_ACCELERATING_SCORE = 45;
/** Momentum score at/above this (but below accelerating) is emerging; below it is candidate. */
export const TOPIC_LIFECYCLE_EMERGING_SCORE = 25;
/** Below this `sampleConfidence`, the window has too few observed videos to trust a state above candidate. */
export const TOPIC_LIFECYCLE_MIN_SAMPLE_CONFIDENCE = 0.3;

export interface TopicLifecycleInput {
  momentumScore: number;
  sampleConfidence: number;
  /** True when this window's momentumScore is lower than the prior snapshot's — same "declining" signal as the per-video/per-channel lifecycle machines. */
  isDeclining: boolean;
  currentState: TopicLifecycleState;
}

/**
 * Score-driven transition, mirroring `nextChannelTier`'s shape: a topic that
 * has earned `peaking` cools into `declining` on a drop rather than snapping
 * straight back to `emerging`/`accelerating`/`trending`, and a `declining`
 * topic stays `declining` (the floor state) until it recovers above the
 * accelerating threshold without declining further.
 */
export function nextTopicLifecycleState(input: TopicLifecycleInput): TopicLifecycleState {
  if (input.sampleConfidence < TOPIC_LIFECYCLE_MIN_SAMPLE_CONFIDENCE) {
    return "candidate";
  }
  if (input.momentumScore >= TOPIC_LIFECYCLE_PEAKING_SCORE) {
    return "peaking";
  }
  if (input.currentState === "peaking" && input.isDeclining) {
    return "declining";
  }
  if (input.currentState === "declining") {
    if (input.momentumScore >= TOPIC_LIFECYCLE_ACCELERATING_SCORE && !input.isDeclining) {
      return "accelerating";
    }
    return "declining";
  }
  if (input.momentumScore >= TOPIC_LIFECYCLE_TRENDING_SCORE) {
    return "trending";
  }
  if (input.momentumScore >= TOPIC_LIFECYCLE_ACCELERATING_SCORE) {
    return "accelerating";
  }
  if (input.momentumScore >= TOPIC_LIFECYCLE_EMERGING_SCORE) {
    return "emerging";
  }
  return "candidate";
}
