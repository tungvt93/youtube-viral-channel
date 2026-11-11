# 0003 Niche Breakout Signal (VSR-lite)

Date: 2026-11-11

## Status

Accepted

## Context

User referenced an external technical note proposing a "View-to-Subscriber
Ratio" (VSR) heuristic to find breakout videos from small/mid channels:
`VSR = viewCount / subscriberCount`, flagged when `VSR >= 3.0` for channels
with 1,000–50,000 subscribers.

The existing Channel Outlier metric (PRD §8.1E, `computeChannelOutlierMultiplier`)
already has a views/subscriber fallback ([[0002-no-vendor-outlier-finder]]),
but it only ever surfaces as a **cohort-relative percentile**
(`outlierPercentile` in the PRD §8.3 Viral Score). A large, well-established
channel can still rank high on that percentile without being a "niche"
breakout; conversely a genuine niche breakout isn't guaranteed to stand out
in its format/age cohort if the cohort itself is thin or noisy.

The user wants a second, independent, **absolute** signal scoped specifically
to small/mid channels, surfaced as its own alert plus a score bonus — not a
replacement for the existing cohort-relative outlier percentile, and not a
new weighted component in `computeViralScore` (PRD §8.3's five weights are
unchanged).

## Decision

Add `computeNicheBreakoutSignal` (`packages/scoring/src/niche-breakout.ts`):

- Scope: `subscriberCount` between 1,000 and 50,000 (inclusive).
- Threshold: `VSR = currentViews / subscriberCount >= 3.0`.
- All three constants are first-cut, taken from the user's reference
  pipeline, not calibrated against real data — same caveat style as
  `RECENCY_TAU_HOURS` and `CHANNEL_OUTLIER_MULTIPLIER_THRESHOLD`.

Wiring in `apps/worker/src/processors/video-scoring.ts`:

- Computed per video from fields already loaded for Channel Outlier
  (`video.currentViewCount`, `video.channelSubscriberCount`) — no new API
  calls, no quota cost.
- **Score bonus:** a flat `+10` added on top of the PRD §8.3 weighted
  `viralScore`, clamped at 100. Stored under a new `scoreBreakdown.nicheBreakout`
  key (`{ isBreakout, vsr, bonus }`), kept separate from the five existing
  weighted components so `computeViralScore`'s weights and tests are
  untouched.
- **Alert:** a new `video_niche_breakout` alert type (free-text column, no
  migration needed), fired via the existing `createAlertIfDue` + 24h cooldown
  — independent of the `monitoringState` state machine. A niche breakout
  does not change `monitoringState` and can fire regardless of it.

## Alternatives Considered

1. Fold VSR into the existing `outlierPercentile` component — rejected: it's
   cohort-relative by design (PRD §8.3), and a straight ratio threshold would
   either distort that percentile or require re-deriving the cohort
   definition. Keeping it a separate signal avoids touching the already-shipped,
   tested §8.3 formula.
2. Gate `monitoringState` transitions (e.g., promote straight to `high_signal`)
   — rejected: `high_signal`/`cooling` (PRD §8.5) is driven by the cohort VPH
   p90 + outlier + decline rules; a niche breakout is a different, additive
   signal, not a substitute state.

## Consequences

Positive:

- Surfaces small-channel breakouts even when the channel's own cohort is thin
  or the video doesn't clear the cohort's VPH p90 yet.
- No schema migration, no new API quota cost.

Tradeoffs:

- Two outlier-ish signals now exist (`outlierPercentile`, `nicheBreakout`)
  with different semantics; `scoreBreakdown` documents both so they're
  distinguishable, but this adds a small amount of conceptual surface.
- Thresholds (1k–50k subs, VSR 3.0, +10 bonus) are unvalidated guesses pending
  real data, same status as the other first-cut constants already in the
  scoring code.

## Follow-Up

- Revisit the three constants once there's enough `video_niche_breakout`
  alert history to tell whether they're too loose/strict.
