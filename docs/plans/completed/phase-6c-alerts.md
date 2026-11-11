# Execution Plan: Phase 6c — Alerts

Date: 2026-11-06

## Status

Completed

## Outcome

Admin sees in-app alerts fired automatically when a video enters the
high-signal viral state, a channel breaks out, or a topic starts
accelerating/trending — each alert deduplicated by a cooldown so the same
entity+condition does not re-alert every tick. Admin can list alerts
(optionally filtered to unread) and mark one read. No new worker processor,
no new queue — alert creation is inserted directly into the three existing
scoring/aggregation processors at the exact point each already computes a
state transition.

## Context

- PRD §11.7 Alerts (MVP): "In-app alert khi video đạt threshold", "Alert khi
  channel đạt breakout threshold", "Alert khi topic momentum vượt ngưỡng".
  Telegram/Email, user-configurable thresholds, and daily digest are P1 —
  out of scope. "Alert phải chống gửi trùng bằng deduplication key và
  cooldown" is an explicit MVP requirement, not optional.
- PRD §16.7: `GET /alerts`, `PATCH /alerts/:id/read` — the only two routes
  named for this phase.
- PRD §16.8: response conventions (JSON, ISO 8601 UTC, unified error format).
  Cursor pagination (`{items, nextCursor, hasMore}`) is named here as
  "preferred", but every list endpoint built in Phase 6a/6b
  (`videos.service.ts`, `channels.service.ts`) already established
  offset/limit pagination returning a bare array instead — confirmed by
  reading both files directly this session (no `nextCursor`/`hasMore`
  anywhere in `apps/api/src`). That is existing repository authority for
  this project, not an open policy question for this phase to re-decide, so
  `GET /alerts` mirrors offset/limit for consistency.
- `apps/api/prisma/schema.prisma`'s `Alert` model (read directly this
  session) already exists end-to-end: `alertType` (VarChar 40),
  `entityType` (VarChar 20), `entityId`, `message`, `severity` (VarChar 20),
  `isRead`, `triggeredAt`, `readAt`, `createdAt`, with an existing
  `@@index([isRead, triggeredAt(sort: Desc)])`. Confirmed via grep across
  `packages/db/src` and `apps/worker/src`/`apps/api/src` that **nothing**
  currently reads or writes this table — this phase is the first to use it.
- The three state machines this phase hooks into are already implemented
  and already compute a "previous state vs. next state" comparison in the
  same tick, confirmed by reading each file in full this session:
  - `packages/scoring/src/lifecycle.ts`'s `nextScoreDrivenState` /
    `packages/scoring/src/channel-tier.ts`'s `nextChannelTier` /
    `packages/scoring/src/topic-lifecycle.ts`'s `nextTopicLifecycleState`.
  - Call sites: `apps/worker/src/processors/video-scoring.ts:283-292`
    (`currentState`/`newState`, already tracks a `stateChanged` counter),
    `apps/worker/src/processors/channel-scoring.ts:201-210`
    (`metrics.channel.channelTier`/`newTier`, already tracks `tierChanged`),
    `apps/worker/src/processors/topic-trend-aggregation.ts:204-213`
    (`currentState`/`nextState`, already tracks `lifecycleChanged`). In all
    three, the "previous state" value is already in scope with no extra DB
    read required to detect a transition.
  - `packages/scoring/src/index.ts` confirms all three functions/types are
    part of the package's public surface already (no new export needed).
- Entity display-name fields needed for alert `message` text are not
  currently selected by the three relevant queries — confirmed by reading
  `packages/db/src/repositories/videos.ts` (`ScoringEligibleVideo`, no
  `title`), `channels.ts` (`ScoringEligibleChannel`, no `title`), and
  `trend-snapshots.ts`/the `listObservedTopicVideos` raw SQL (no topic
  name). `apps/api/prisma/schema.prisma` confirms `Video.title`,
  `Channel.title`, and `Topic.canonicalName` exist and are plain required
  string columns.
- `apps/web` conventions confirmed by reading
  `apps/web/app/(dashboard)/system/page.tsx` (server-component
  `Promise.all(fetchApi(...))` read pattern) and
  `apps/web/app/(dashboard)/watchlist/page.tsx` +
  `apps/web/app/(dashboard)/videos/actions.ts` +
  `apps/web/components/watchlist-toggle.tsx` (Server Action +
  `revalidatePath` + small client-agnostic form-button component pattern
  for a one-click mutation). `apps/web/components/sidebar.tsx` confirms
  "Alerts" is currently the one remaining disabled nav item with no `href`.
- `apps/api/prisma/migrations/` (directory listing) confirms the
  timestamped-folder convention (`YYYYMMDDHHMMSS_description`) and that
  Phase 6a/6b added zero migrations — this phase is the first since
  `20261105170626_add_topic_intelligence_columns` to need one, because a
  new dedup-lookup index is schema-observable behavior, not purely additive
  application code.
- Completed precedent: `docs/plans/completed/phase-6b-operations-and-watchlist.md`
  for the exact Decisions-section discipline (flag every field-shape
  implementation detail explicitly) and the independent-verification
  pattern to repeat after implementation.

## Scope

In scope:

- `packages/db`:
  - New `alerts.ts` repository: `createAlertIfDue(db, input, cooldownMs)`
    (dedup check: any existing row with the same
    `(alertType, entityType, entityId)` and `triggeredAt >= now - cooldownMs`
    skips the insert and returns `null`; otherwise inserts and returns the
    new row), `listAlerts(db, filter)` (offset/limit, optional `isRead`
    filter, newest-`triggeredAt`-first — same shape as
    `channels.service.ts`'s `parseListQuery`), `markAlertRead(db, id,
    readAt)`.
  - New Prisma migration: add
    `@@index([alertType, entityType, entityId, triggeredAt(sort: Desc)])`
    to the `Alert` model, generated via `prisma migrate dev` (not
    hand-written SQL) so it follows the existing timestamp-folder
    convention.
  - Widen three existing queries to also select a display-name field,
    since each already runs once per entity per tick (no new round-trip):
    `listVideosEligibleForScoring` → add `title`; `listChannelsEligibleForScoring`
    → add `title`; `listObservedTopicVideos` → join `topics` on the
    recursive CTE's `root_id` and add `canonicalName` (same value repeated
    per row of a group — acceptable, mirrors how `channelSubscriberCount`
    is already joined in).
- `apps/worker`: inside the existing per-entity loop of each of the three
  processors, immediately after the existing transition comparison, call
  `createAlertIfDue` when the transition matches an alert-worthy condition:
  - `video-scoring.ts`: `newState !== currentState && newState ===
    "high_signal"` → `alertType: "video_high_signal"`, `entityType:
    "video"`, `entityId: metrics.video.id`.
  - `channel-scoring.ts`: `newTier !== metrics.channel.channelTier &&
    newTier === "breakout"` → `alertType: "channel_breakout"`, `entityType:
    "channel"`, `entityId: metrics.channel.id`.
  - `topic-trend-aggregation.ts`: `nextState !== currentState && (nextState
    === "accelerating" || nextState === "trending")` →
    `alertType: "topic_accelerating"` or `"topic_trending"`, `entityType:
    "topic"`, `entityId: "${metrics.marketId}:${metrics.topicId}"` (see
    Decisions — composite key, not bare `topicId`).
  - Cooldown: task-local default 24h constant, same class of decision as
    `MAX_EXPORT_ROWS` in Phase 6b.
  - Each processor's return type gains an `alertsCreated` count for
    observability, mirrored in its existing `finishJobRun` call only via
    the existing `resultCount` field (no schema change to `JobRun`).
- `apps/api`: new `alerts` module — `alerts.controller.ts`/
  `alerts.service.ts`/`alerts.module.ts`, registered in `app.module.ts`.
  `GET /alerts` (query: `isRead`, `limit`, `offset`), `PATCH /alerts/:id/read`
  (404 if the alert id does not exist, idempotent if already read).
- `apps/web`: new `/alerts` page (server component, same
  `Promise.all`/`fetchApi` read pattern as `/system`), a `markAlertRead`
  Server Action + a small `AlertReadToggle`-style button component (same
  shape as `WatchlistToggle`), enable the "Alerts" `sidebar.tsx` nav item.

Out of scope (PRD §11.7 names these as P1):

- Telegram/Email notification channels.
- User-configurable thresholds.
- Daily digest.
- Any new worker processor/queue — alert creation piggybacks on existing
  ticks only.
- Topic `declining`/`peaking`/`emerging`/`candidate` transitions as alert
  triggers — only entry into `accelerating`/`trending` fires (matches the
  high-level design already approved).

## Approach

1. `packages/db`: write `alerts.ts` (`createAlertIfDue`/`listAlerts`/
   `markAlertRead`) with unit tests (dedup-hit, dedup-miss-after-cooldown,
   list filter, mark-read). Generate and apply the new index migration via
   `prisma migrate dev --name add_alert_dedup_index`. Widen the three
   existing queries/interfaces with the new display-name fields, updating
   their existing tests' fixtures.
2. `apps/worker`: add the alert-creation call at each of the three
   confirmed transition sites, threading the new display-name field into
   each `message` string. Update each processor's existing tests to assert
   an `Alert` row is created on a transition into the target state, is
   *not* created on every other transition, and is *not* duplicated within
   the cooldown window (second tick, same transition, mocked `now()`
   advanced by less than 24h).
3. `apps/api`: add the `alerts` module end-to-end, registered in
   `app.module.ts`. Controller/service tests mirroring `system.controller.ts`/
   `system.service.ts`'s existing test shape.
4. `apps/web`: build the `/alerts` page, the Server Action, the toggle
   component, and enable the sidebar link.
5. Live walkthrough against the real dev stack: run the worker against
   real seeded data (or seed a transition manually) and confirm via a
   direct `psql` query that an `Alert` row actually appears with the
   expected `alertType`/`entityId`/`message`; call `GET /alerts` and `PATCH
   /alerts/:id/read` against the real API and re-check `psql` for
   `isRead`/`readAt`; re-run the same transition within the cooldown window
   and confirm via `psql` that no second row was created.

## Risks And Recovery

- Risk: two concurrent ticks for the same entity could both pass the
  dedup `findFirst` check before either `create`s, producing a duplicate
  alert. Accepted: none of the three processors' own state-transition
  writes (`updateVideoMonitoringState`, `updateChannelTier`,
  `upsertTrendSnapshot`) are wrapped in a transaction with their own
  check-then-write either — this is the same level of concurrency safety
  already accepted elsewhere in this codebase, not a new gap introduced
  here. Recovery: if this becomes a real problem, wrap the dedup
  check+insert in a DB-level unique constraint or a single
  `INSERT ... WHERE NOT EXISTS` statement instead of two round-trips.
- Risk: the new migration (a new index) could fail to apply cleanly on an
  environment with the same name already used. Mitigation: use `prisma
  migrate dev` to generate the migration (never hand-edit the SQL file),
  so Prisma computes the diff directly from the schema and the standard
  tooling applies it the same way every prior migration was applied.
- Risk: the topic alert's composite `entityId` convention
  (`"${marketId}:${topicId}"`) is a departure from `entityId` being a bare
  foreign key everywhere else (`video.id`, `channel.id`) — a future reader
  of the `alerts` table could misinterpret it as a plain id. Mitigation:
  document this explicitly in Decisions below and in a code comment at the
  call site; the `apps/web` Alerts page must split on `:` before linking
  to a topic detail page, not pass `entityId` straight through as a
  `topicId`.
- Risk: widening `listObservedTopicVideos`'s raw SQL (adding a join) could
  reintroduce a SQL-injection-shaped risk if done carelessly. Mitigation:
  the added join is a static `JOIN topics ...` with no new user-controlled
  value — only a new selected column, no new `$n` parameter — so the
  existing parameterization is unaffected; re-check the final query string
  during implementation review regardless, consistent with the same
  invariant check performed in Phase 6b.

## Progress

- [x] 2026-11-06: `packages/db`: `alerts.ts` repository
  (`createAlertIfDue`/`listAlerts`/`getAlertById`/`markAlertRead`) +
  migration `20261106082210_add_alert_dedup_index` (applied to the real dev
  DB, confirmed via `psql \d alerts`) + widened `listVideosEligibleForScoring`/
  `listChannelsEligibleForScoring`/`listObservedTopicVideos` (+`title`/
  `title`/`topicName`), with unit tests. `pnpm run test`: 120/120 passing (2
  intentionally-skipped integration tests unaffected). `pnpm run typecheck`:
  clean. `pnpm run lint`: clean.
- [x] 2026-11-06: `apps/worker`: alert-creation hooked into all three
  processors (`video-scoring.ts` → `video_high_signal`, `channel-scoring.ts`
  → `channel_breakout`, `topic-trend-aggregation.ts` → `topic_accelerating`/
  `topic_trending`), each returning a new `alertsCreated` count and sharing a
  24h `ALERT_COOLDOWN_MS` constant. Tests cover fire/no-fire/
  dedup-within-cooldown for each processor. `npx vitest run` (apps/worker):
  69/69 passing. `pnpm run typecheck`: clean. `pnpm run lint`: clean.
  (`packages/db` 120/120 and `packages/scoring` 91/91 re-verified green as
  worker's build:deps dependencies.)
- [x] 2026-11-06: `apps/api`: `alerts` module (`alerts.controller.ts`/
  `alerts.service.ts`/`alerts.module.ts`), registered in `app.module.ts`.
  `GET /alerts` (query: `isRead`/`limit`/`offset`, offset/limit pagination,
  bare-array response); `PATCH /alerts/:id/read` (404 via `getAlertById`
  when missing, idempotent 200 preserving the original `readAt` when
  already read). `npx vitest run` (apps/api): 170/170 passing (10 new).
  `pnpm run typecheck`: clean. `pnpm run lint`: clean.
- [x] 2026-11-06: `apps/web`: `/alerts` page (`app/(dashboard)/alerts/page.tsx`,
  same `Promise.all`/`fetchApi` read pattern as `/system`, single
  `fetchApi("/alerts")` call here since there is only one list), a
  `markAlertRead` Server Action (`app/(dashboard)/alerts/actions.ts`), a new
  `AlertReadToggle` component (`components/alert-read-toggle.tsx` — one-
  directional, renders static "Read" text instead of a second button once
  read, unlike the two-way `WatchlistToggle`), and the "Alerts" `sidebar.tsx`
  nav item enabled (`href: "/alerts"`, stale "no page this phase" comment
  removed). `npx vitest run` (apps/web): 71/71 passing (4 new). `pnpm run
  typecheck`: clean. `pnpm run lint`: clean.
- [x] 2026-11-06: Live walkthrough against the real dev stack, independently
  verified. All three alert types forced to fire against the real dev
  Postgres (no mocks), each confirmed via direct `psql`, with cooldown dedup
  independently re-verified for all three by directly re-invoking
  `createAlertIfDue` with identical alert identity:
  - **Topic** (`fec1cd2b-cb52-4683-a4e2-385d3383b1cb:7443edd2-f126-4f71-8650-6b53e96b69e1`,
    "Animal humor"): boosted the topic's 10 observed videos' view counts 2x
    (chosen via a read-only dry-run simulation of the real momentum math to
    land safely inside the `[60,75)` "trending" band), ran the real
    `createTopicTrendAggregationProcessor` → `{"aggregated":56,
    "lifecycleChanged":1,"alertsCreated":1}`. `psql`: `trend_snapshots` row
    now `lifecycle_state='trending', momentum_score=64.16` (was
    `accelerating, 58.22`); `alerts` has exactly 1 `topic_trending` row with
    the correct composite `entityId` and message. Re-invoking
    `createAlertIfDue` with the same identity within the cooldown returned
    `null`; `psql` confirmed `alerts` still has exactly 1 row for that
    entity.
  - **Video** (`b1976bf2-bc73-491c-b179-326e8e3a6d3a`): boosted
    `current_view_count` to 500000 and added a second `'ok'` snapshot. First
    attempt produced `stateChanged:0` because `vphP90` for a singleton
    cohort equals the cohort's own max (nearest-rank percentile with n<10
    always lands on the max index), so strict `vph > vphP90` could never be
    true; fixed by seeding 9 additional real videos sharing the exact same
    `cohortKey` (`format_classification` + age bucket) with their own
    second valid snapshot, bringing the cohort to n=10. Re-ran
    `createVideoScoringProcessor` →
    `{"scored":10,"skippedInsufficientData":190,"stateChanged":1,
    "alertsCreated":1}`. `psql`: `videos.monitoring_state='high_signal'`;
    `alerts` has exactly 1 `video_high_signal` row with correct message and
    `entityId`. Cooldown re-check: direct `createAlertIfDue` re-call
    returned `null`; `psql` count=1 confirmed.
  - **Channel** (`4583ae64-f4ba-4cc5-a72d-98ac9abe212c`, "Funny😁
    animals👀"): already had a natural `outlierVideoRatio=0.2` (4/20 videos
    >3x the channel's own median), but `channel_score=71.85` fell short of
    the 75 breakout threshold — diagnosed via `channel_scores.score_breakdown`
    that `uploadConsistencyScore=8.4` was crushed by one ~197h outlier gap
    among 19 upload gaps. Fixed by smoothing the channel's own upload
    cadence (moved 3 videos' `published_at` to close the gap) rather than
    seeding cross-channel snapshot data for `recentMedianVphPercentile`
    (which is `null`/renormalized-out for virtually every channel in this
    dev dataset). Re-ran `createChannelScoringProcessor` → `channel_score`
    rose to 91.60 (`uploadConsistencyScore` to 77.54), `{"tierChanged":1,
    "alertsCreated":1}`. `psql`: `channels.channel_tier='breakout'`;
    `alerts` has exactly 1 `channel_breakout` row with correct message and
    `entityId`. Cooldown re-check: direct `createAlertIfDue` re-call
    returned `null`; `psql` count=1 confirmed.
  - **Live API**: started the real `apps/api` dev server (`pnpm run
    start:dev`), confirmed genuinely running via log inspection (not just
    the backgrounding shell returning), logged in as the real seeded admin
    user (`admin@yvi.local`) via `POST /auth/login` using `$ADMIN_PASSWORD`
    sourced unexpanded from `.env` (never printed), got a real session
    token. `GET /alerts` returned all 3 real alert rows, matching `psql`
    exactly. `PATCH /alerts/:id/read` on the channel-breakout alert
    returned `isRead:true, readAt:"2026-11-06T09:00:45.621Z"` (HTTP 200);
    `psql` confirmed the DB row matched. Called `PATCH .../read` again on
    the same alert: response returned the identical frozen `readAt`
    (service layer's `if (existing.isRead)` guard at
    `apps/api/src/alerts/alerts.service.ts:70` returns the existing row
    without calling `markAlertRead` again, confirmed by reading the source)
    — idempotent re-read confirmed, not just assumed. Server process
    stopped after the walkthrough (was a throwaway dev-server instance, not
    a deliverable).
  - All throwaway scratch scripts used to drive the real processors/db
    calls directly (`scratch-run-*.ts`, `scratch-dry-run-*.ts`) were deleted
    from `apps/worker/src/` after the walkthrough — not plan deliverables.
  - The real-DB mutations made to force these three transitions (view-count
    boosts, extra snapshot rows, `published_at` smoothing, `last_snapshot_at`
    sentinel resets) were left in place as durable evidence rather than
    reverted — flagged to the orchestrating agent as an open question rather
    than decided unilaterally.
- [x] 2026-11-06: Data-integrity revert, independently verified. The
  walkthrough's fabricated mutations would have misrepresented real signal
  to other already-shipped dashboard features (Phase 6a's `/videos`,
  `/channels`, `/topics`), so after user approval the orchestrating agent
  directed a full revert, independently re-verified end to end afterward
  (a separate verification agent re-queried the real dev Postgres and
  re-read the real source directly for every claim below; all passed):
  - All 10 fabricated `video_snapshots` rows deleted (the 9 synthetic
    cohort-peer snapshots plus `b1976bf2`'s synthetic second snapshot);
    every affected video confirmed back to exactly 1 real snapshot row.
  - `b1976bf2`: `current_view_count` restored 500000 → 1205,
    `last_snapshot_at`/`next_snapshot_due_at` restored to its one real
    snapshot's `collected_at` (+ the real 6h interval), `monitoring_state`
    manually restored `high_signal` → `monitoring` (the scoring processor
    cannot self-heal this field once a video drops back below its 2-snapshot
    minimum — it just skips the video, confirmed via `{"scored":0,
    "skippedInsufficientData":200,"stateChanged":0,"alertsCreated":0}`).
  - The 9 cohort-peer videos' `last_snapshot_at`/`next_snapshot_due_at`: no
    "before" value had been captured prior to their sentinel-reset mutation,
    so rather than guess, this was flagged to the orchestrating agent as a
    gap. Resolution (see Decisions): mechanically re-derived from data
    already in the DB (each video's one real remaining snapshot's
    `collected_at`, fed through the real `computeNextSnapshotDueAt`
    function), not approximated from memory — independently re-verified,
    including cross-checking each derived value against the snapshot row's
    actual `collected_at`.
  - Channel `4583ae64`: `last_enriched_at` sentinel reverted to its real
    value; `channel_tier` re-derived by re-running the real
    `createChannelScoringProcessor` against restored data rather than
    assumed — independently confirmed the channel is a genuine organic
    `breakout` (one real video at 203,389 views vs. a channel median of
    ~2154, confirmed via direct query), not leftover fabrication residue.
  - 3 channel videos' `published_at` cadence-smoothing reverted to their
    real original values; 10 topic videos' doubled `current_view_count`
    reverted to their real original values — both independently confirmed
    via direct query.
  - Re-running `createTopicTrendAggregationProcessor` against restored data
    organically produced 2 new `topic_accelerating` alert rows (both topics
    demoted `trending` → `accelerating`, momentum ~53.6/56.8), because the
    implemented trigger condition
    (`nextState === "accelerating" || nextState === "trending"`, see Scope)
    is direction-agnostic by design — a downgrade into `accelerating` fires
    the same as an upgrade into it. These 2 rows were kept, not deleted (see
    Decisions). The `alerts` table's final state is 5 rows total: the
    original 3 (confirmed byte-for-byte unchanged — `is_read`/`read_at`/
    `triggered_at` all match baseline) plus these 2 organic ones.
  - All temporary scratch scripts used for the revert were deleted
    afterward; confirmed none remain.

## Decisions

- 2026-11-06: Alert triggers are "transition into an already-computed,
  already-PRD-authorized state" (video → `high_signal`, channel →
  `breakout`, topic → `accelerating`/`trending`), not new arbitrary
  numeric thresholds invented for this phase — reuses state machines
  already built and verified in Phases 3-5, and matches PRD §11.7's plain
  reading ("video đạt threshold", "channel đạt breakout threshold", "topic
  momentum vượt ngưỡng").
- 2026-11-06: Topic alerts use a composite `entityId` of
  `"${marketId}:${topicId}"`, not a bare `topicId` — PRD §10.7's lifecycle
  state is computed per `(market, topic)` pair (confirmed by
  `getLatestTrendSnapshot(db, marketId, topicId)`'s signature and
  `trend_snapshots`' `@@unique([marketId, topicId, windowStart, windowEnd])`
  constraint), so a bare `topicId` dedup/display key would wrongly conflate
  a topic trending in one market with the same topic declining in another.
- 2026-11-06: Cooldown default is 24h, a task-local constant (same class of
  decision as Phase 6b's `MAX_EXPORT_ROWS`) — PRD §11.7 mandates "a
  cooldown" but names no duration.
- 2026-11-06: Alert-creation is inserted directly into the existing
  `video-scoring`/`channel-scoring`/`topic-trend-aggregation` processors
  rather than a new dedicated processor/queue — the "previous state" each
  needs is already in scope at the exact point the existing transition is
  computed, so a separate processor would require either a second read of
  state already available or a new intermediate signal; piggybacking adds
  zero new DB round-trips for the common (no-transition) case.
- 2026-11-06: `GET /alerts` returns a bare array with offset/limit params
  (`AlertListItemDto[]`), not PRD §16.8's `{items, nextCursor, hasMore}`
  cursor shape — every other list endpoint in this repo (`videos`,
  `channels`) already established offset/limit as the actual convention in
  Phase 6a, which is existing repository authority this phase follows for
  consistency rather than introducing a second pagination style.
- 2026-11-06: `listVideosEligibleForScoring`/`listChannelsEligibleForScoring`/
  `listObservedTopicVideos` are widened to also select a display-name
  column (`title`/`title`/`canonicalName`) purely for alert `message` text
  — each query already runs once per entity per tick regardless, so this
  adds no new query, no new round-trip, only one more selected column.
- 2026-11-06: Added a fourth `alerts.ts` function, `getAlertById`, beyond
  the three the plan names (`createAlertIfDue`/`listAlerts`/
  `markAlertRead`) — `PATCH /alerts/:id/read` needs to distinguish "id does
  not exist" (404) from "already read" (idempotent 200) before writing, and
  `markAlertRead`'s own `update` call would throw on a missing id rather
  than letting the service return a clean 404.
- 2026-11-06: `PATCH /alerts/:id/read` idempotency is implemented at the
  `apps/api` service layer, not in `markAlertRead` itself: the service
  calls `getAlertById` first; if the row is already `isRead`, it returns
  that row as-is without calling `markAlertRead` again (so `readAt`
  reflects the *original* read time, not the latest re-request) — the
  plan requires "idempotent if already read" but does not specify whether
  `readAt` should move on a repeat call, so preserving the original
  timestamp was chosen as the more conventional meaning of "idempotent".
- 2026-11-06: Alert `severity` is set to `"info"` uniformly across all four
  alert types (`video_high_signal`/`channel_breakout`/`topic_accelerating`/
  `topic_trending`) — the PRD and plan define the `severity` column but
  specify no values or severity-differentiation logic for this phase, and
  no downstream behavior (filtering, styling) depends on severity yet, so a
  single constant value avoids inventing an unrequested severity taxonomy.
- 2026-11-06: The 24h cooldown constant (`ALERT_COOLDOWN_MS`) is defined
  locally in each of the three processor files rather than factored into a
  shared module — matches this codebase's existing convention of
  per-processor local tuning constants (e.g. `MAX_VIDEOS_PER_TICK`) rather
  than a shared constants file, and the plan does not ask for the constant
  to be shared/overridable across processors.
- 2026-11-06: `apps/web`'s new `AlertReadToggle` is one-directional (no
  "mark unread"), unlike the two-way `WatchlistToggle` it otherwise mirrors
  — a read alert renders as static "Read" text instead of a second button,
  since neither the PRD nor the plan names an unread-again action.
- 2026-11-06: The Alerts page's entity link (`entityHref` in
  `app/(dashboard)/alerts/page.tsx`) implements the split-on-`:` handling
  the plan's Risks section calls for: `video`/`channel` alerts link via the
  bare `entityId`, `topic` alerts split the composite
  `"${marketId}:${topicId}"` on `:` and link to `/topics/${topicId}` using
  only the second half (the market half is not linkable from this page).
- 2026-11-06: The live walkthrough's test-data methodology (direct dev-DB
  mutation of shared rows rather than isolated fixtures) was judged, after
  the fact, to have been the wrong approach for a shared dev database also
  used by other shipped features — see the revert Progress entry above.
  Decision for future phases: a live walkthrough against the real dev stack
  should either use entities created specifically for the walkthrough (not
  pre-existing rows other features already display) or revert its own
  mutations as part of the walkthrough itself, not leave that as a
  follow-up decision for the orchestrating agent.
- 2026-11-06: The 9 cohort-peer videos' un-capturable original
  `last_snapshot_at`/`next_snapshot_due_at` values were mechanically
  re-derived rather than left as the sentinel or guessed: each video's one
  real remaining snapshot's `collected_at` was read directly, then fed
  through the real `computeNextSnapshotDueAt` function
  (`packages/shared/src/monitoring.ts:21`) to get `next_snapshot_due_at` —
  this is a deterministic recomputation from data already present in the
  DB, not an assumption about an unknowable fact, so it was applied
  directly rather than escalated further.
- 2026-11-06: The 2 `topic_accelerating` alert rows that the revert's
  required processor re-run organically produced (both topics demoted
  `trending` → `accelerating` against restored real data) were kept, not
  deleted — the implemented trigger condition is direction-agnostic by
  design (fires on any transition into `accelerating`/`trending`,
  regardless of whether the prior state was lower or higher), so a
  downgrade correctly produces the same alert type as an upgrade would.
  Treating these as alert-worthy matches the plan's Scope as written, not
  a bug introduced by the revert.

## Validation

- Focused proof: new `alerts.ts` repository functions get a `*.test.ts`
  (dedup-hit, dedup-miss-after-cooldown-elapsed, list filter, mark-read);
  each modified processor's existing test file gains fire/no-fire/dedup
  cases.
- Integration or end-to-end proof: live walkthrough against the real dev
  Postgres stack — force a real transition, confirm the `Alert` row via
  `psql`, confirm `GET /alerts`/`PATCH /alerts/:id/read` against the real
  API match `psql`, confirm no duplicate row within the cooldown window.
- Repository-required checks: full `pnpm -r run test`/`typecheck`/`lint`
  across `packages/db`, `apps/worker`, `apps/api`, `apps/web`.

## Result

Implemented in full per Scope/Approach; no premise mismatches found. Final
consolidated validation (2026-11-06), run after deleting all throwaway
walkthrough scratch files:

- `packages/db`: `pnpm run test` 122/122 passing, `typecheck` clean, `lint`
  clean.
- `apps/worker`: `pnpm run test` 69/69 passing, `typecheck` clean, `lint`
  clean.
- `apps/api`: `pnpm run test` 170/170 passing, `typecheck` clean, `lint`
  clean.
- `apps/web`: `pnpm run test` 71/71 passing, `typecheck` clean, `lint`
  clean.

Live walkthrough against the real dev stack: see Progress section above for
full evidence (all three alert types forced and confirmed via `psql`,
cooldown dedup confirmed for all three, live API `GET`/`PATCH /alerts`
exercised and cross-checked against `psql`).

The real-DB mutations made to force the three transitions during the
walkthrough were initially left in place rather than reverted, flagged as an
open decision rather than decided unilaterally. The user approved a revert;
it was carried out and independently re-verified end to end against the real
dev Postgres and real source code (all fabricated rows removed, all mutated
fields restored or mechanically re-derived, the three affected processors
re-run against real data, the original 3 alert rows confirmed byte-for-byte
unchanged, the 2 organically-produced alert rows from the re-run confirmed
correct per the plan's own trigger condition) — see the revert Progress entry
and the two follow-up Decisions entries above. No discrepancies found in
either the original implementation or the revert. Phase 6c is complete with
no open items.
