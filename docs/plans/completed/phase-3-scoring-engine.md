# Execution Plan: Phase 3 — Scoring Engine

Date: 2026-11-05

## Status

Complete

## Outcome

Videos with at least two valid snapshots (Phase 2) get a computed, stored
Viral Score with a visible breakdown, and promote/demote themselves between
`monitoring` → `high_signal` → `cooling` based on that score — PRD §8 and the
Phase 3 roadmap task list (PRD §25). This is what Release 0.2 "Viral
Detection" (PRD §26) needs to prove the system finds fast-growing videos
instead of just sorting by total views.

## Context

- PRD §8 (Thuật toán phát hiện Viral Video): VPH, GrowthPct, Acceleration,
  Channel outlier multiplier, Recency, percentile normalization, the
  weighted Viral Score formula (§8.3), candidate thresholds (§8.4), and the
  video lifecycle table (§8.5).
- PRD §15.12 / `apps/api/prisma/schema.prisma`: `video_scores` already
  scaffolded in Phase 0 (`viral_score`, `score_breakdown` JSON,
  `data_confidence`, `computed_at`) — unused until now, same situation
  `video_snapshots` was in before Phase 2.
- `packages/scoring`: already exists as an empty workspace package
  (`packageMarker()` stub only) — this phase is its first real content.
- [[0002-no-vendor-outlier-finder]]: confirms the channel-outlier fallback
  formula `views / max(subscriber_count, 100)` for channels with too few
  comparable videos, to be implemented here (not copied from the vendored
  repo — reimplemented independently).
- `docs/plans/completed/phase-2-snapshot-monitoring.md`: left `video.
  monitoring_state`/`next_snapshot_due_at` ready for `high_signal`/`cooling`
  (3h/48h intervals already implemented in `computeNextSnapshotDueAt`, just
  unreachable until this phase sets those states), and explicitly deferred
  "any scoring computation" and "`high_signal`/`cooling`/`archived`
  transitions" to this phase.
- `packages/db/src/repositories/video-snapshots.ts` / `videos.ts`: existing
  `listVideoSnapshots`, `getVideoById`, `updateVideoMonitoringState` are
  reused as-is; this phase adds new repository functions alongside them, not
  changes to them.
- Scoring is pure computation over already-stored data — it makes no
  YouTube API calls, so `checkQuotaGuard` does not apply here.

## Scope

**In scope:**

- `packages/scoring`: pure, unit-tested functions implementing PRD §8.1–8.4:
  `computeVph`, `computeGrowthPct`, `computeAcceleration`, channel outlier
  multiplier (with the decision-0002 fallback), `computeRecencyScore`,
  a percentile-rank normalizer, `computeViralScore` (weighted formula with
  missing-metric re-normalization and `data_confidence`), and a candidate
  threshold check (§8.4).
- `packages/scoring`: a score-driven lifecycle function, separate from
  Phase 2's snapshot-outcome `nextMonitoringState` — `monitoring` →
  `high_signal` when §8.4 thresholds are met; `high_signal` → `cooling` on a
  declining VPH; `cooling` → `high_signal` if growth resumes. `unavailable`
  is untouched (Phase 2 owns it).
- One new BullMQ queue, `video-scoring`, and **one** repeatable
  `JobScheduler` (single fixed id, e.g. `"video-scoring-tick"`) — same
  single-static-id pattern as `video-monitoring-tick`, decoupled from the
  monitoring tick rather than chained off it (see Decisions).
- Comparison cohort for percentile normalization: grouped by
  `format_classification` + a fixed age bucket (<1d, 1–3d, 3–7d, 7–14d,
  14d+). Market/topic grouping from PRD §8.2 is explicitly not available yet
  (see Scope-out).
- Channel outlier baseline: median of `current_view_count` across up to 20
  of the channel's other videos already in our DB; fallback to
  `views / max(subscriber_count, 100)` with reduced `data_confidence` when
  fewer than 5 comparable videos exist.
- Repository functions in `packages/db` to select scoring-eligible videos
  (≥2 valid snapshots, state in `monitoring`/`high_signal`/`cooling`) and to
  insert `VideoScore` rows.
- `apps/worker`: `video-scoring` processor (DI'd via `ProcessorDeps`, same
  shape as `video-monitoring.ts`), bounded per tick like
  `MAX_VIDEOS_PER_TICK`.
- One read endpoint, `GET /videos/:id/scores`, returning score history for
  one video (mirrors Phase 2's `GET /videos/:id/snapshots`).
- Live verification: run the real worker long enough to observe a real
  scoring tick against already-snapshotted real videos, confirm a real
  `video_scores` row and (if thresholds are met) a real `high_signal`
  transition.

**Out of scope (explicit, to avoid overbuild):**

- Alert dispatch on threshold crossing — still needs the `alerts`
  table/dispatch mechanism; not required to prove detection works.
- `archived` lifecycle state — PRD §8.5 ties it to "hết thời gian theo dõi
  hoặc người dùng archive," neither of which has a concrete rule or a UI
  trigger yet. Stays `cooling` instead of ever reaching `archived` in this
  phase.
- Market- and topic-aware comparison cohorts — market is many-to-many via
  `discovery_events` (not a direct `Video` column) and topic classification
  doesn't exist until Phase 5. Using `format_classification` + age bucket
  only is a documented simplification, not a missed requirement.
- The §8.1E "compare at the same video age using historical snapshots"
  refinement — using current channel view counts as the baseline is the
  simpler, PRD-allowed fallback ("Tốt hơn nữa là..." is phrased as an
  enhancement, not a requirement).
- Phase 4's channel baseline/tier infrastructure (uploads playlist
  discovery, channel score/tier, `channel_scores` population) — this
  phase's channel outlier step reads existing `current_view_count` only.
- A ranked "Viral Videos" list API or page — Phase 6 dashboard. Proving
  ranking works is covered by this phase's live verification query, not a
  new list endpoint.
- Any change to `video-monitoring`'s own snapshot-outcome transitions
  (`candidate`→`monitoring`, →`unavailable`) — Phase 2 still owns those.

## Approach

1. `packages/scoring`: implement and unit-test each PRD §8.1 metric function
   independently (VPH, GrowthPct, Acceleration, channel outlier + fallback,
   Recency), then the percentile normalizer, then `computeViralScore`
   composing them with the §8.3 weights and missing-metric re-normalization,
   then the §8.4 candidate-threshold check and the score-driven lifecycle
   function.
2. `packages/db`: add `listVideosEligibleForScoring` (≥2 valid snapshots,
   state filter) and `insertVideoScore`, following the existing repository
   module pattern (plain functions taking `PrismaClient`, no classes).
3. `apps/worker`: `video-scoring` queue definition; `video-scoring.ts`
   processor — selects the eligible batch, builds comparison cohorts in
   memory, computes each video's score and lifecycle transition, writes
   `VideoScore` rows and any `monitoring_state` change via the existing
   `updateVideoMonitoringState`.
4. `apps/worker/src/schedulers`: register the single scoring-tick
   `JobScheduler` alongside the existing discovery/monitoring schedulers.
5. `apps/api`: add `GET /videos/:id/scores` to the existing `videos` module.
6. Tests (`pnpm -r run typecheck`/`lint`/`test`) green.
7. Live verification against the real worker/API/Postgres: confirm real
   `video_scores` rows for already-snapshotted real videos, and inspect
   whether any video's state actually reaches `high_signal` (PRD §8.4's
   thresholds are strict — age < 14 days, outlier ≥ 3 — so this may
   legitimately be zero on the first run; that is not a failure by itself,
   only the computation and write path need to be proven correct).

## Risks And Recovery

- **Thin snapshot history limits what's provable live.** Phase 2 has only
  been running briefly, so most videos will have exactly 2 snapshots (one
  VPH interval, no Acceleration yet — correctly `null`, not 0). Recovery:
  this is expected, not a bug; verification checks the computation handles
  it correctly (re-normalized weights, lower `data_confidence`), not that
  every metric is populated.
- **Decoupling the scoring tick from the monitoring tick** (Decisions)
  means a video can wait up to one scoring-tick interval after its newest
  snapshot before being scored, instead of the PRD's literal "insert
  snapshot → enqueue scoring" chain. Acceptable since nothing downstream
  (alerts) consumes the score yet; revisit if Phase 3's chosen interval
  turns out too slow once alerting is built.
- **Lifecycle transition logic is a first cut**, not yet calibrated against
  real data (PRD §8.3 itself says "Score cần được hiệu chỉnh sau khi có
  lịch sử dữ liệu"). Recovery: thresholds/weights live as named constants in
  `packages/scoring`, not scattered inline, so later tuning is a localized
  change.
- **Repeating earlier bug classes.** The scoring scheduler reuses the
  single-fixed-id repeatable-tick pattern (no per-item composite jobIds), so
  it does not reintroduce the BullMQ colon-jobId bug by construction.

## Progress

- [x] `packages/scoring`: VPH/GrowthPct/Acceleration/Recency pure functions
      (unit tests).
- [x] `packages/scoring`: channel outlier multiplier + decision-0002
      fallback (unit tests).
- [x] `packages/scoring`: percentile-rank normalizer (unit tests).
- [x] `packages/scoring`: `computeViralScore` with missing-metric
      re-normalization and `data_confidence` (unit tests).
- [x] `packages/scoring`: §8.4 candidate-threshold check + score-driven
      lifecycle transition function (unit tests).
- [x] `packages/db`: `listVideosEligibleForScoring` + `insertVideoScore`.
- [x] `video-scoring` BullMQ queue + processor (unit tests, no real API
      involved).
- [x] Scoring-tick scheduler registered in `apps/worker/src/main.ts`.
- [x] `GET /videos/:id/scores` endpoint (unit tests).
- [x] `pnpm -r run typecheck`/`lint`/`test` green at the workspace root.
- [x] Live verification: real scoring tick produces real `video_scores`
      rows for already-snapshotted real videos.

## Decisions

- **Channel-peer lookup is keyed per distinct `channel_id`, not per video.**
  `listChannelPeerViews(db, channelId, limit)` is called once per distinct
  channel in the eligible batch (deduped via a `Set`, results cached in a
  `Map`), then each video excludes itself from its own channel's peer list in
  memory. With up to 200 eligible videos per tick potentially sharing
  channels, calling once per video would have been an avoidable N+1.
- **A VPH anomaly (negative delta) nulls out that video's own VPH-derived
  components and is excluded from the cohort's `vphRawAscending`/`vphLog`
  arrays**, rather than letting a bad delta corrupt either its own score or
  its peers' percentile ranking. The video is still scored (via
  `computeViralScore`'s missing-metric re-normalization, with a reduced
  `data_confidence`), not skipped outright — only <2 valid snapshots skips a
  video entirely.
- **A VPH anomaly in either the current or the previous interval forces
  `acceleration` to `null`** for that tick (not a stale/misleading rate), on
  top of the existing "no `prevPrev` snapshot" case.
- **`isDeclining` requires `acceleration !== null && acceleration < 0`** —
  absence of a prior interval is never read as "declining." Confirmed live:
  the one video promoted during verification had `acceleration: null`
  (only 2 snapshots) and `accelerationPercentile: null` in its breakdown, and
  was correctly promoted to `high_signal` rather than blocked or treated as
  cooling.
- **Channel outlier multiplier uses `video.current_view_count` (the
  enrichment-time column) uniformly for both the scored video and its
  channel peers**, not the latest `video_snapshot` row's view count. This
  matches the plan Scope's literal wording and keeps the comparison
  apples-to-apples (both sides measured the same way); the tradeoff is
  possible staleness relative to the snapshot just used for VPH/Growth — not
  hidden, just accepted for this phase per Scope-out §8.1E refinement.
- **`updateVideoMonitoringState` is only called when the score-driven state
  actually changes**, not on every tick for every scored video. This
  preserves the Phase 2/Phase 3 ownership boundary from Context: Phase 2 owns
  `next_snapshot_due_at`'s cadence, and a same-state scoring tick must not
  overwrite it.
- **`RECENCY_TAU_HOURS = 24` and `MIN_COMPARABLE_CHANNEL_VIDEOS = 5`** are
  first-cut named constants in `apps/worker/src/processors/video-scoring.ts`,
  not calibrated against real data (PRD §8.3's own caveat, see Risks) —
  intentionally localized for later tuning.
- **The scoring tick is a fully separate 15-minute `JobScheduler`**
  (`video-scoring-tick`, single fixed id, no composite jobId), decoupled from
  `video-monitoring-tick` rather than chained off snapshot inserts, per
  Scope/Risks.
- **`packages/scoring/tsconfig.json` needed an explicit `"declaration":
  true`** override (sibling packages already had it) — without it,
  `apps/worker` failed `tsc` with TS7016 ("could not find a declaration file
  for module '@yvi/scoring'") because the monorepo's `tsconfig.base.json`
  defaults `declaration` to `false`.
- **`packages/db/src/index.ts` re-exports `VideoSnapshot` as a type** so
  `apps/worker`'s processor can group snapshots by video without reaching
  into `@yvi/db`'s `generated/client` subpath — caught and fixed during
  authoring, before any test run.
- **The API DTO layer converts `VideoScore.viral_score`/`data_confidence`
  from Prisma `Decimal` to `number` via `.toNumber()`**, mirroring how
  `videos.service.ts` already handles `BigInt` view counts for the sibling
  `GET /videos/:id/snapshots` endpoint — confirmed by inspecting
  `packages/db/generated/client/index.d.ts` (`create()` accepts a plain
  `number`, but reads return `Prisma.Decimal`).

## Validation

- Focused proof: unit tests for every pure function in `packages/scoring`,
  covering normal cases, missing-metric cases (null Acceleration, no prior
  interval), and the channel-outlier fallback path.
- Integration proof (mocked data): a scoring tick writes one `VideoScore`
  row per eligible video with a non-null `viral_score` and a
  `score_breakdown` that accounts for every component used, and correctly
  skips videos with fewer than 2 valid snapshots.
- End-to-end proof (real data): at least one real scoring tick against
  already-snapshotted real videos produces real `video_scores` rows;
  `GET /videos/:id/scores` returns them.
- Repository-required checks: none configured yet — local-command proof
  only (unchanged from Phase 1/2).

## Result

**Tests (workspace root, `pnpm -r run typecheck`/`lint`/`test`):** all green.

- `pnpm -r run typecheck`: exit 0, no errors across all 10 workspace
  projects.
- `pnpm -r run lint`: exit 0, no errors/warnings across all 10 workspace
  projects.
- `pnpm -r run test`: exit 0.
  - `@yvi/db`: 18 passed, 2 skipped (pre-existing integration tests
    unrelated to this phase) — 7 test files.
  - `@yvi/api`: 14 passed — 5 test files, including the new `getScores`
    404 case and the `Decimal`→`number` mapping test.
  - `@yvi/scoring`: 53 passed — 5 test files (`metrics`, `normalize`,
    `viral-score`, `lifecycle`, plus the existing `index` marker test).
  - `@yvi/worker`: 29 passed — 11 test files, including the new
    `video-scoring.test.ts` (5 tests, covering the 10-video cohort
    promotion scenario, a VPH-anomaly case, and the error path) and the
    scheduler-registration test.

**Live verification against the real worker code, real Postgres
(`docker-postgres-1`, port 5440), and the real API** — no YouTube API calls
made (this phase makes none by design):

1. Found the real DB already had 399 `monitoring`-state videos, each with
   exactly one `fetch_status='ok'` snapshot (0 pre-existing `video_scores`
   rows) — i.e. no video yet had the ≥2 snapshots scoring requires.
2. Seeded one synthetic second `video_snapshot` (tagged
   `source='manual-verification'` for easy identification/cleanup) for 12
   real videos in one real channel (`ffa67001-263f-4d8a-b517-c5b1ef727995`,
   format `long`, all published same day — same comparison cohort), with one
   clear outlier (`7b3089a7-9ff1-497a-b96d-28692a73f31f`: 1 → 6000 views)
   and eleven modest-growth peers.
3. Invoked the real, compiled `createVideoScoringProcessor(deps)` directly
   against the real `PrismaClient` (`@yvi/db`'s `prisma` singleton) with a
   synthetic job id — same processor code the real `apps/worker` BullMQ
   worker runs, bypassing only the queue transport itself to avoid waking
   the real `video-monitoring` scheduler's quota-spending tick.
4. Real result: `{ scored: 12, skippedInsufficientData: 188, stateChanged: 1
   }` (188 = the other real eligible videos in this 200-video tick, all
   correctly skipped for having only one snapshot).
5. Real `video_scores` rows (12, up from 0): top row —
   `videoId=7b3089a7-9ff1-497a-b96d-28692a73f31f`, `viral_score=95.07`,
   `data_confidence=0.90` (acceleration weight dropped and redistributed —
   only 2 snapshots, no prior interval — matching 1 − 0.10 = 0.90), with a
   `score_breakdown` showing `vphPercentile`/`growthPercentile`/
   `outlierPercentile` all at the 95.8th cohort percentile,
   `accelerationPercentile: null`, and a populated `recencyScore100`.
6. Real lifecycle transition: that same video's `monitoring_state` flipped
   `monitoring` → `high_signal` in Postgres (confirmed by re-querying the
   row after the tick) — the only one of the 12 whose VPH exceeded its
   cohort's p90 with outlier ≥ 3, exactly §8.4's threshold.
7. Real `job_runs` row: `status='completed'`, `resultCount=12`,
   `durationMs=134`, `errorMessage=null`.
8. Started the real `apps/api` (NestJS) against the same real DB; its
   startup log mapped `{/videos/:id/scores, GET}`. `curl` against
   `GET /videos/7b3089a7-9ff1-497a-b96d-28692a73f31f/scores` returned the
   same real row as JSON (`"viralScore":95.07`, full `scoreBreakdown`,
   `"dataConfidence":0.9`); a random non-existent video id correctly
   returned HTTP 404.
9. Cleanup: deleted all 12 synthetic `video_scores` rows, all 12 synthetic
   `video_snapshots` rows (`source='manual-verification'`), the synthetic
   `job_runs` row, and restored all 12 videos' `current_view_count`,
   `last_snapshot_at`, and `monitoring_state` to their exact pre-verification
   values — re-queried afterward to confirm an exact match. The temporary
   verification script was deleted; `git status` shows no leftover files.

**Unresolved risks (carried forward, not blocking):** the lifecycle/weight
constants are first-cut and uncalibrated (Risks); the decoupled 15-minute
scoring-tick interval means a short delay between a new snapshot and its
score (Risks) — both accepted tradeoffs already recorded above and in Risks,
not new findings from verification.
