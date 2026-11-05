# Execution Plan: Phase 2 — Snapshot & Monitoring

Date: 2026-11-05

## Status

Complete

## Outcome

Videos already discovered in Phase 1 get periodic, adaptive-frequency view
snapshots so a growth history exists over time (PRD §7). This is a hard
prerequisite for Phase 3 Scoring (VPH/Growth/Acceleration all need at least
two snapshots) — Release 0.2 "Viral Detection" per PRD §26 cannot start
without it.

## Context

- PRD §7 (Monitoring và snapshot collection): monitoring states, suggested
  snapshot frequency table, snapshot fields, snapshot quality rules.
- PRD §15.6/§15.7 (`video_snapshots`/`channel_snapshots`): both tables were
  already scaffolded in Phase 0's Prisma schema and are unused until now.
- PRD §17.1–§17.5 (Job Queue): `video-monitoring` queue, job flow, retry
  policy, concurrency — reused patterns from Phase 1's `discovery-*`/
  `*-enrichment` processors (DI via `ProcessorDeps`, `enqueueWithJobRun`,
  `checkQuotaGuard`).
- PRD §18 (Quota): internal budget allocation is a reference ratio, not an
  enforced sub-budget — Phase 1 already implemented a single global daily
  guard (`checkQuotaGuard`/`evaluateQuotaGuard`); this phase reuses it
  unchanged.
- [[0001-mvp-scope-decisions]]: 10,000 units/day is an unverified assumption,
  still not re-confirmed in Google Cloud Console — relevant here because
  monitoring is an *additional*, recurring quota consumer on top of
  discovery.
- `docs/plans/completed/phase-1-youtube-data-collection.md`: source of the
  reusable patterns above, and of the hard-won lesson that BullMQ rejects a
  custom `jobId` containing `:` outside its own 3-segment
  `repeat:<id>:<timestamp>` format — this phase's scheduler design (one
  single-id repeatable tick, no per-item composite ids) avoids that bug class
  by construction rather than needing another sanitize.

## Scope

**In scope:**

- `Video` model gains `monitoring_state` (varchar, default `candidate`),
  `last_snapshot_at` (timestamptz, nullable), `next_snapshot_due_at`
  (timestamptz, default `now()` so new videos are immediately eligible) —
  the only schema migration this phase needs; `video_snapshots` itself
  needs no change.
- One new BullMQ queue, `video-monitoring`, and **one** repeatable
  `JobScheduler` (a single fixed id, e.g. `"video-monitoring-tick"`) that
  ticks on a fixed interval and, per tick: quota-guards itself, selects
  videos due for a snapshot, batches their ids (≤50 per `videos.list` call,
  reusing `packages/youtube-client`'s existing batching), inserts
  `VideoSnapshot` rows, and updates each video's `monitoring_state`/
  `last_snapshot_at`/`next_snapshot_due_at`.
- Adaptive frequency: a pure function implementing the PRD §7.3 table
  (video age + monitoring state → next due interval), unit-tested in
  isolation, same style as `quota-guard.ts`/`idempotency.ts`.
- Lifecycle transitions this phase automates: `candidate` → `monitoring` on
  first successful snapshot; any state → `unavailable` when the API no
  longer returns the video. These are the only transitions PRD §7.2 defines
  that don't depend on a growth signal.
- Snapshot quality rules from PRD §7.5: never write on a failed API call,
  never substitute 0 for a missing count, store a lower-than-previous count
  as-is (no monotonic clamping) rather than rejecting it.
- One read endpoint, `GET /discovery/videos/:id/snapshots` (or a new
  `videos` module — decided during implementation), returning snapshot
  history for one video — the "snapshot APIs" roadmap task, scoped to what
  Phase 6's future detail-page chart will need, nothing broader.
- Live verification: run the real worker long enough to observe at least one
  real monitoring tick against an already-discovered real video, confirm a
  new row in `video_snapshots`, confirm `api_usage_logs` reflects it.

**Out of scope (explicit, to avoid overbuild):**

- `channel-monitoring` queue / populating `channel_snapshots` — not in the
  PRD §25 Phase 2 task list; channel history starts in Phase 4 (Channel
  Intelligence baseline).
- `high_signal`/`cooling`/`archived` automatic transitions — PRD §7.2 ties
  these to growth signals (VPH/Acceleration) that don't exist until Phase 3.
  Phase 2 only ever sets `candidate`/`monitoring`/`unavailable`.
- Alert dispatch on threshold crossing (job flow step 7) — needs Phase 3
  scoring plus the `alerts` table/dispatch mechanism; not required for
  Release 0.1/0.2's goal of proving snapshot + growth detection works.
- Per-category (discovery vs. monitoring vs. enrichment) quota sub-budgets —
  PRD §18.2's 35/20/25/10/10 split stays a documented reference ratio only,
  same as Phase 1; one global `daily_budget` guard continues to apply to all
  endpoints together.
- Any dashboard/chart UI — Phase 6.
- Any scoring computation (VPH, Growth%, Acceleration, Viral Score,
  `data_confidence`) — Phase 3, consumes this phase's snapshots as input.

## Approach

1. Prisma migration: additive-only columns on `videos`
   (`monitoring_state`, `last_snapshot_at`, `next_snapshot_due_at`); no
   existing column/table changes.
2. `packages/shared`: `computeNextSnapshotDueAt(state, publishedAt, now)`
   (PRD §7.3 table) and `nextMonitoringState(current, outcome)` pure
   functions, each with unit tests covering every table row/transition.
3. `packages/db`: repository functions — `listVideosDueForSnapshot`,
   `insertVideoSnapshot`, `updateVideoMonitoringState` — following the
   existing repository module pattern.
4. `apps/worker`: `video-monitoring` queue definition; `video-monitoring.ts`
   processor (DI'd via `ProcessorDeps` like the Phase 1 processors),
   quota-guarded, batching through `packages/youtube-client`'s existing
   `videos.list` batch call — no new YouTube client code needed.
5. `apps/worker/src/schedulers`: register the single monitoring-tick
   `JobScheduler` alongside the existing discovery schedulers in `main.ts`.
6. `apps/api`: add the snapshot-history read endpoint.
7. Tests (`pnpm -r run typecheck`/`lint`/`test`) green; then a live run
   against the real worker/API/Postgres, same discipline as Phase 1 —
   observe a real tick, verify a real row, verify quota was logged, keep the
   verification window short to limit quota spend.

## Risks And Recovery

- **Over-polling burns quota.** Mitigated by reusing `checkQuotaGuard`
  before every tick's API calls, plus the age/state frequency table itself
  keeping older/quieter videos on long intervals. Recovery: if a live tick
  misbehaves, stop the worker (`kill`) immediately, same as the Phase 1
  incident — the fix doesn't require a running worker.
- **Schema migration risk.** Columns are additive with defaults
  (`monitoring_state` defaults `'candidate'`, `next_snapshot_due_at`
  defaults `now()`), so existing rows/code paths are unaffected; no
  backfill script needed.
- **Repeating the BullMQ colon-jobId bug.** Avoided by design: the
  monitoring scheduler uses one fixed, colon-free job id and does not
  chain into further dynamically-composed BullMQ ids the way discovery →
  enrichment did. If a future change adds per-item fan-out jobs here, reuse
  `enqueueWithJobRun`'s existing sanitize rather than re-deriving it.
- **Quota assumption still unverified** ([[0001-mvp-scope-decisions]]).
  Monitoring adds a second, recurring consumer on top of discovery; if the
  real daily quota is lower than the assumed 10,000 units, the guard will
  surface it as blocked jobs rather than silently failing — acceptable for
  MVP, but worth flagging to the user again once live.

## Progress

- [x] Prisma migration: `monitoring_state`/`last_snapshot_at`/
      `next_snapshot_due_at` on `videos`.
- [x] `computeNextSnapshotDueAt` + `nextMonitoringState` pure functions
      (unit tests).
- [x] `packages/db` repository functions for due-video selection and
      snapshot/state writes.
- [x] `video-monitoring` BullMQ queue + processor (unit tests, mocked API).
- [x] Monitoring-tick scheduler registered in `apps/worker/src/main.ts`.
- [x] `GET .../videos/:id/snapshots` endpoint (unit tests).
- [x] Snapshot quality rules enforced (no write on API error, no 0
      substitution, no monotonic clamping) — covered by processor tests.
- [x] Mocked-API test suite green end-to-end (tick → snapshot → state
      update), no real key required.
- [x] `pnpm -r run typecheck`/`lint`/`test` green at the workspace root.
- [x] Live verification: real worker tick produces a real `video_snapshots`
      row for an already-discovered real video; `api_usage_logs` reflects
      the real call.

## Decisions

- 2026-11-05: `computeNextSnapshotDueAt` treats `candidate` and `monitoring`
  identically (age-only bucketing: <3d → 6h, 3–7d → 12h, >7d → 24h) instead
  of giving "candidate mới, tín hiệu cao" (PRD §7.3) its own 2–4h bucket.
  There is no signal-priority input available yet (VPH/Acceleration don't
  exist until Phase 3), so the fast "high-signal candidate" row can't be
  distinguished from a plain candidate in this phase. `high_signal` (3h),
  `cooling`/`archived` (48h) branches are implemented for completeness but
  are unreachable in Phase 2 since this phase never sets those states.
- 2026-11-05: `unavailable` is treated as a terminal state in
  `nextMonitoringState` — no transition back to `monitoring` on a later
  success. The YouTube Data API gives no per-id error for a removed/private
  video; `listVideosByIds` just omits its id from `items`, so "unavailable"
  is detected by diffing the requested id set against the returned items.
- 2026-11-05: chose a 15-minute fixed interval
  (`VIDEO_MONITORING_TICK_INTERVAL_MS`) for the single repeatable tick.
  Neither the PRD nor this plan specifies a tick cadence (only the
  per-video due-interval table); 15 minutes keeps the 6h-minimum due
  interval's actual drift small relative to the interval itself.
- 2026-11-05: added a new `apps/api/src/videos/` module (`VideosController`
  + `VideosService`) for `GET /videos/:id/snapshots` rather than extending
  `discovery`, since the resource (`Video`/`VideoSnapshot`) has no
  conceptual relationship to discovery queries/jobs — matches the existing
  one-module-per-resource pattern (`health`, `discovery`).
- 2026-11-05: `VideoSnapshotDto` serializes `view_count`/`like_count`/
  `comment_count` as strings, not numbers. These columns are `BIGINT`;
  `JSON.stringify` throws on a raw `bigint`, and a plain `number` would
  silently lose precision above `Number.MAX_SAFE_INTEGER` for very large
  view counts.
- 2026-11-05: verified live against the real YouTube Data API that an
  already-stale worker/api process pair from earlier in this same session
  (ports 3001/3002, ~3h uptime, pre-dating this phase's code) was still
  running the old build; killed both PIDs before starting fresh instances
  so the live verification actually exercised the new code, not a stale
  snapshot of it.

## Validation

- Focused proof: unit tests for the frequency function, lifecycle
  transition function, and processor (PRD §23.1).
- Integration proof (mocked API): a monitoring tick inserts
  `VideoSnapshot` rows without duplicates for already-snapshotted
  videos in the same bucket, skips videos not yet due, never writes on a
  simulated API error, and transitions `candidate` → `monitoring` on first
  success.
- End-to-end proof (real API): one real tick against at least one real,
  already-discovered video produces a real snapshot row and a real
  `api_usage_logs` entry.
- Repository-required checks: none configured yet — local-command proof
  only (unchanged from Phase 1).

## Result

- Workspace-wide checks, all green, zero regressions:
  - `pnpm -r run typecheck` — exit 0, all 10 packages.
  - `pnpm -r run lint` — exit 0, all 9 lintable packages.
  - `pnpm -r run test` — exit 0; 29 tests in `@yvi/shared` (incl. 20 new in
    `monitoring.test.ts`), 23 tests in `@yvi/worker` (incl. 6 new in
    `video-monitoring.test.ts`), 11 tests in `@yvi/api` (incl. 3 new for the
    `videos` module), 39 in `@yvi/youtube-client`, plus `@yvi/db`'s existing
    suite (5 files, 12 passed / 2 skipped — the skipped ones are the
    pre-existing real-Postgres integration tests, same skip behavior as
    before this change).
- Live verification against the real Dockerized Postgres
  (`docker-postgres-1`, port 5440) and the real YouTube Data API key from
  `.env` (never printed):
  - Before: `videos` had 893 rows due for a snapshot
    (`next_snapshot_due_at <= now()`); `video_snapshots` had 0 rows;
    `api_usage_logs` had 199 rows.
  - Started `apps/worker` (`start:dev`) — log confirmed
    `"registered video-monitoring scheduler"` and the queue list including
    `video-monitoring`.
  - One tick ran automatically on scheduler registration, and a second tick
    was triggered manually (enqueued directly to the `video-monitoring`
    queue to avoid waiting the full 15-minute interval) — both completed
    per `job_runs` (`job_name` `video-monitoring` / `manual-trigger`,
    `status` `completed`).
  - After: `video_snapshots` had 399 new rows, all `fetch_status = 'ok'`,
    `source = 'videos.list'`, e.g. video `f34d513f-269e-4fb1-bbc2-9a1c7b7199d8`
    → `view_count 167`, `like_count 5`, `comment_count 5`.
  - `videos.monitoring_state` after the ticks: 493 `candidate`, 399
    `monitoring`, **1 `unavailable`** — the unavailable-detection path
    (diffing requested ids against `listVideosByIds`' returned `items`) was
    exercised by a real video the API no longer returns, not just by unit
    tests.
  - `api_usage_logs` gained 2 new rows: `id 200` and `201`,
    `endpoint = 'videos.list(monitoring)'`, `quota_estimate = 4`,
    `status = 'success'` — confirms real quota was logged per tick.
  - Started `apps/api` (`start:dev`) — log confirmed
    `"Mapped {/videos/:id/snapshots, GET} route"`.
  - `GET /videos/f34d513f-.../snapshots`-style call against a video with a
    real snapshot returned `200` with a JSON array containing
    `viewCount`/`likeCount`/`commentCount` as strings (BigInt-safe).
  - `GET /videos/<random-uuid>/snapshots` against a non-existent video
    returned `404` with `{"message":"video ... not found", ...}`.
  - No errors or warnings appeared in either process's log during the
    verification window. Both processes were stopped (`kill`) immediately
    after confirming the above, per the plan's own quota-spend discipline.
  - Incidental finding, not a defect in this phase's code: both port 3001
    and 3002 were already occupied by stale worker/api processes left
    running from earlier in this same session (pre-dating these changes);
    they were killed before starting the real verification run so the
    verification exercised the new build.
- Residual risk carried forward unchanged from Risks And Recovery: the
  10,000 units/day quota assumption ([[0001-mvp-scope-decisions]]) is still
  unverified in Google Cloud Console, and monitoring is now a second
  permanent consumer of that budget alongside discovery.
