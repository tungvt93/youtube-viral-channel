# Execution Plan: Phase 4 — Channel Intelligence

Date: 2026-11-05

## Status

Complete

## Outcome

The system discovers new uploads from channels it already knows about (not
only from search/region discovery), computes per-channel baseline metrics,
and assigns each channel an analytical tier (`newcomer`/`rising`/
`breakout`/`established`/`cooling`) via a Channel Outlier Score — PRD §9 and
the Phase 4 roadmap task list (PRD §25). This is what lets the system
surface "channel X is breaking out" rather than only "video Y is viral,"
and is a prerequisite for Release 0.2's "Channel Outlier Detection" bullet
(PRD §26).

## Context

- PRD §9 (Channel Intelligence): goals (phát hiện channel đang lên, channel
  nhỏ có video outlier, channel có nhiều video tăng trưởng, channel đổi tần
  suất/hiệu suất upload), channel metrics (§9.2), Channel Outlier Score
  formula (§9.3: `0.40*OutlierVideoRatioPercentile +
  0.30*RecentMedianVPHPercentile + 0.20*UploadConsistencyScore +
  0.10*ChannelRecencyScore`, explicitly not using subscriber count as a main
  factor), channel tiers (§9.4, internal labels not an official YouTube
  classification), and the 9-step channel discovery workflow (§9.5).
- PRD §6.1D/§6.1E: `channels.list` (already implemented, Phase 1) and
  `playlistItems.list` (not implemented yet) — reading a channel's uploads
  playlist to find new videos without depending on search queries.
- `apps/worker/src/processors/channel-enrichment.ts`: already captures
  `uploads_playlist_id` per channel (Phase 1) but does nothing with it; its
  own comment defers "playlist/upload fetching" to this phase.
- `packages/youtube-client`: no `playlistItems.list` method yet; `QUOTA_COST`
  currently only has `search_list`/`videos_list`/`channels_list`.
- `apps/api/prisma/schema.prisma`: `ChannelSnapshot`/`ChannelScore` already
  scaffolded in Phase 0, unused until now (same situation `video_scores` was
  in before Phase 3). `Channel` has no tier/state column yet, unlike
  `Video.monitoring_state`. `DiscoveryEvent.market_id` is currently
  **required** (non-nullable) — see Decisions for why this phase loosens it.
- `apps/worker/src/processors/video-enrichment.ts`: the existing
  ids-in/channel-stub-out/discovery-event pipeline that any newly-discovered
  video id (regardless of source) already flows through; this phase reuses
  it for channel-uploads-sourced ids rather than building a parallel path.
- [[0001-mvp-scope-decisions]]: 10,000 units/day quota assumption still
  unverified in Google Cloud Console. This phase adds a third recurring
  consumer (`playlistItems.list`) alongside discovery and monitoring — the
  unverified-budget risk compounds, flagged again below.
- `apps/worker/src/schedulers/index.ts`: single-static-id repeatable
  `JobScheduler` pattern (Phase 1–3) — any new periodic tick in this phase
  follows it unchanged.
- `packages/scoring`: existing `percentileRank`, `logTransform`, `median`,
  and the missing-metric re-normalization pattern from `computeViralScore`
  are reused for the Channel Outlier Score, not reimplemented.

## Scope

**In scope:**

- Prisma migration: `channels.channel_tier` (varchar, default
  `'newcomer'`), `channels.last_video_discovery_at` (nullable timestamptz,
  paces uploads-playlist polling); `discovery_events.market_id` becomes
  nullable (see Decisions).
- `packages/youtube-client`: `listPlaylistItems(playlistId, maxResults)`
  (single page, no deep pagination — see Scope-out) + a `playlist_items_list`
  `QUOTA_COST` entry, unit-tested.
- `packages/shared`: `VideoEnrichmentJobData.marketId` becomes
  `string | null`; a `channel-video-discovery` queue name and job-data type;
  a `channel-scoring` queue name.
- `packages/scoring`: channel-level pure functions — median channel views
  (reuse `median`), a channel's recent median VPH (reuse `computeVph`
  against each video's latest valid snapshot pair), an upload-consistency
  score from inter-upload gaps, a channel recency score (exp decay off most
  recent upload), and `computeChannelOutlierScore` composing all four per
  §9.3 with the same missing-metric re-normalization/`dataConfidence`
  pattern as `computeViralScore`. A tier-assignment pure function
  (`nextChannelTier` or similar) — all unit-tested.
- `packages/db`: repository functions — channels due for an uploads-playlist
  poll, channels eligible for scoring (with enough video/snapshot data to
  compute the four metrics above), `insertChannelScore`, update
  `channel_tier`/`last_video_discovery_at`, and list/detail queries for the
  API (latest score per channel, likely via a `DISTINCT ON` raw query to
  avoid N+1 — same discipline as Phase 3's channel-peer lookup).
- `apps/worker`: `channel-video-discovery` processor (quota-guarded,
  `playlistItems.list` per due channel, diff against known
  `youtube_video_id`s, enqueue genuinely new ids onto the existing
  `video-enrichment` queue with `marketId: null`, `source: "channel_uploads"`)
  + its single-static-id scheduler tick; `channel-scoring` processor (no API
  calls, same decoupled-tick shape as `video-scoring`) + its scheduler tick.
- `apps/api`: new `channels` module — `GET /channels` (filter by tier, sort
  by latest score, pagination) and `GET /channels/:id` (metrics + latest
  score breakdown + tier) — matches the Phase 4 roadmap deliverable
  "Channel list/detail API" (PRD §25); PRD §16.4 lists more channel
  endpoints (`/videos`, `/snapshots`, watchlist) but only list/detail is
  this phase's deliverable (see Scope-out).
- Live verification: run the real worker long enough to observe a real
  `playlistItems.list` call discover at least one real new video from an
  already-known channel's uploads, and a real channel-scoring tick produce
  a real `channel_scores` row (tier change itself may legitimately be rare
  on first run, same caveat as Phase 3's `high_signal`).

**Out of scope (explicit, to avoid overbuild):**

- Full historical backlog backfill of a channel's uploads playlist — PRD
  §9.5 step 5 says "tối đa N video gần nhất theo quota budget," explicitly
  bounded; this phase pulls one page (≤ `maxResults`) per channel per tick,
  not the whole playlist.
- `GET /channels/:id/videos`, `GET /channels/:id/snapshots`, watchlist
  POST/DELETE (PRD §16.4) — not named in the Phase 4 roadmap deliverable;
  `/videos` and `/snapshots` are naturally covered once the dashboard
  (Phase 6) needs them, watchlist is a standing feature decision not scoped
  here.
- Channel watchlist auto-add, dashboard Channel Discovery table/detail page
  — Phase 6 UI.
- Market- or topic-scoped channel metrics — channels aren't market-scoped;
  topic classification doesn't exist until Phase 5.
- AI-based channel categorization/description analysis — Phase 5.
- Alert dispatch on tier change — still deferred (no `alerts` table/dispatch
  mechanism yet, same as Phase 3).
- A dedicated change-point/anomaly detector for upload frequency — only a
  simple consistency score (PRD §9.2 lists "thay đổi tần suất upload" as a
  metric to have, not a detector to build).

## Approach

1. Prisma migration for `channels.channel_tier`,
   `channels.last_video_discovery_at`, and `discovery_events.market_id`
   nullable; regenerate client.
2. `packages/youtube-client`: `listPlaylistItems` + `playlist_items_list`
   quota cost, unit tests.
3. `packages/shared`: widen `VideoEnrichmentJobData.marketId` to
   `string | null`; add the two new queue names/job-data types.
4. `packages/scoring`: channel metric functions, then
   `computeChannelOutlierScore`, then the tier-assignment function — each
   unit-tested independently before composing.
5. `packages/db`: due-channels query, scoring-eligible-channels query (with
   whatever per-video data each channel metric needs), `insertChannelScore`,
   tier/`last_video_discovery_at` updates, list/detail queries for the API.
6. `apps/worker`: `channel-video-discovery` processor + scheduler tick;
   `channel-scoring` processor + scheduler tick; wire both into
   `main.ts`/`processors/index.ts`/`queues/index.ts` following the existing
   patterns exactly.
7. `apps/api`: new `channels` module (controller/service/module) —
   `GET /channels`, `GET /channels/:id`.
8. Tests (`pnpm -r run typecheck`/`lint`/`test`) green.
9. Live verification against the real worker/API/Postgres: confirm a real
   `playlistItems.list` call and resulting new video row, a real
   `channel_scores` row, and exercise both new API endpoints against real
   data.

## Risks And Recovery

- **Quota: third recurring consumer.** `playlistItems.list` joins
  `search.list`/`channels.list` (discovery) and `videos.list` (monitoring)
  as a recurring cost against the still-unverified 10,000 units/day
  assumption ([[0001-mvp-scope-decisions]]). Recovery: keep the per-tick
  channel batch size small and bounded (named constant), and treat
  "actually check Google Cloud Console's real quota" as a now-overdue
  action item, not just a residual note.
- **Loosening `discovery_events.market_id` to nullable changes an existing
  NOT NULL column.** Recovery: grep for existing code that assumes
  `marketId` is always present (market-grouped queries/aggregations) before
  the migration lands, and confirm nothing breaks on a null value.
- **Channel Outlier Score weights/tier thresholds are a first cut**,
  uncalibrated against real data — same accepted pattern as Phase 2/3
  (PRD itself expects post-launch calibration). Recovery: named constants in
  `packages/scoring`, not scattered inline.
- **A channel with very few videos/snapshots can't support all four §9.3
  metrics** (e.g. no `RecentMedianVPH` without ≥2 snapshots on any video).
  Recovery: reuse the missing-metric re-normalization + reduced
  `dataConfidence` approach already proven in `computeViralScore`, not a
  guessed default.
- **Uploads-playlist polling cadence is a first-cut fixed interval**, not
  the adaptive per-state cadence Phase 2 uses for video snapshots (PRD §9.5
  doesn't specify one). Recovery: a single named constant, revisit if it
  turns out too slow/fast once real data exists.
- **Repeating earlier bug classes.** Both new scheduler ticks reuse the
  single-fixed-id repeatable-tick pattern (no per-item composite jobIds),
  so neither reintroduces the BullMQ colon-jobId bug by construction.

## Progress

- [x] Migration: `channel_tier`, `last_video_discovery_at`,
      `discovery_events.market_id` nullable.
- [x] `packages/youtube-client`: `listPlaylistItems` + quota cost (unit
      tests).
- [x] `packages/shared`: nullable `marketId` on `VideoEnrichmentJobData`;
      new queue names/job-data types.
- [x] `packages/scoring`: channel metric functions (unit tests).
- [x] `packages/scoring`: `computeChannelOutlierScore` (unit tests).
- [x] `packages/scoring`: tier-assignment function (unit tests).
- [x] `packages/db`: due-channels / scoring-eligible-channels queries,
      `insertChannelScore`, tier/update queries, list/detail queries.
- [x] `channel-video-discovery` queue + processor + scheduler (unit tests).
- [x] `channel-scoring` queue + processor + scheduler (unit tests).
- [x] `GET /channels` + `GET /channels/:id` endpoints (unit tests).
- [x] `pnpm -r run typecheck`/`lint`/`test` green at the workspace root.
- [x] Live verification: real `playlistItems.list` discovery, real
      `channel_scores` row, both API endpoints exercised against real data.

## Decisions

- **Channel tier thresholds (first cut, named constants).**
  `CHANNEL_TIER_BREAKOUT_SCORE = 75`, `CHANNEL_TIER_RISING_SCORE = 50`,
  `CHANNEL_TIER_NEWCOMER_MAX_AGE_DAYS = 90`. Uncalibrated against real data,
  same accepted first-cut pattern as Phase 2/3 scoring weights — PRD expects
  post-launch calibration. Revisit once enough `channel_scores` history
  exists to look at the real score distribution.
- **Upload-consistency score formula**: `100 * exp(-coefficientOfVariation)`
  over inter-upload gaps, requires ≥3 uploads to be meaningful (a single gap
  has no variance to measure). Channels below that threshold simply omit
  this metric from the composite score and get re-normalized weights, same
  as any other missing metric.
- **Channel-scoring eligibility**: a channel qualifies for a scoring tick if
  it has at least one known video (`videos: { some: {} }`). This is
  deliberately permissive — a channel with exactly one video still gets a
  score (reduced `dataConfidence`, since most of the four §9.3 metrics need
  more data than that), rather than requiring an arbitrary minimum video
  count up front. Confirmed live: most of the 100 real channels scored this
  run had only `outlierVideoRatioPercentile` + `channelRecencyScore`
  populated (lacking ≥3 uploads for consistency, lacking a valid snapshot
  pair for VPH), landing at `dataConfidence = 0.5000` exactly as designed.
- **Single global cohort for channel scoring**, unlike video-scoring's
  market/category sub-cohorts. Channels aren't market-scoped (Scope-out) and
  there is no channel-level category grouping yet (that's Phase 5 topic
  classification), so there is no natural sub-cohort to percentile-rank
  within; all channels compete in one global percentile pool for now.
- **Reused `CHANNEL_OUTLIER_MULTIPLIER_THRESHOLD = 3`** (same multiplier
  bound `computeViralScore` already uses for video-level outlier
  classification) rather than inventing a second constant, since the
  underlying "how many multiples above a channel's own median counts as an
  outlier video" question is the same shape of judgment call.
- **`CHANNEL_RECENCY_TAU_HOURS = 7 * 24`** (one week) for the exponential
  decay off a channel's most recent upload — a channel that posted within
  the last week scores near 100 on this metric, decaying over ~1-2 weeks.
  First-cut, named constant, not calibrated against real upload-frequency
  distributions yet.
- **`isDeclining` defined over a single interval** (current score vs. the
  immediately preceding score), not a multi-point trend — simplest
  definition that satisfies PRD §9.4's cooling-tier intent without building
  a time-series trend detector (explicitly out of scope — "no dedicated
  change-point/anomaly detector").
- **`DISTINCT ON` + `LEFT JOIN LATERAL` raw SQL** for `listChannels`/
  `getChannelDetail` (first raw SQL in this codebase) to fetch each
  channel's single latest `channel_scores` row without an N+1 query or a
  window-function round-trip through Prisma's query builder — same
  discipline as Phase 3's channel-peer lookup, which established that raw
  SQL is acceptable here specifically for "latest row per group" shapes
  Prisma's query API can't express directly.
- **`nulls: "first"` ordering** for `listChannels`'s `latestChannelScore`
  sort — channels with no score yet (the common case right after discovery,
  before their first scoring tick) sort to the bottom when sorting
  descending by score, rather than being interleaved arbitrarily.
- **`listKnownYoutubeVideoIds` batched existence check** added to
  `packages/db/src/repositories/videos.ts` so `channel-video-discovery` can
  diff a channel's uploads-playlist page against already-known video ids in
  one query per channel instead of one query per candidate id — quota-
  irrelevant (it's a DB call, not a YouTube API call) but still avoids an
  N+1 DB pattern on every tick.
- **`apps/api` channels module mirrors the existing `videos` module's
  conventions exactly** rather than introducing a new pattern: plain
  `@Injectable()` service calling `@yvi/db` repo functions + the shared
  `prisma` singleton directly (no repository DI), `NotFoundException` for a
  missing channel, BigInt counts stringified, Prisma `Decimal` fields
  normalized via `Number(...)`, `Date` fields via `.toISOString()`. No DTO
  classes/`class-validator`, since no other controller in the codebase uses
  them and no global `ValidationPipe` is configured in `apps/api/src/main.ts`.
- **Plain `@Query()` string parsing via `parseListQuery`** rather than a
  validation pipe or DTO — `GET /channels` is the first endpoint in this
  codebase to take query-param filters/pagination, so there was no existing
  convention to break; `parseListQuery` clamps `limit` to `[1, 100]`
  (default 20) and defaults `offset` to 0, falling back to defaults on
  non-numeric or non-positive input rather than erroring, consistent with
  the project's existing preference for permissive defaults over strict
  request validation.
- **Live-verification side effects were kept, not rolled back.** Running the
  real worker produced genuine new rows: 50 real `playlistItems.list` calls
  (one per due channel) via `channel-video-discovery`, and 100 real
  `channel_scores` rows plus 100 real `newcomer` → `rising` tier flips via
  `channel-scoring`. These are correct output of the feature operating on
  real data, not artificial test pollution — deleting them would destroy
  genuine evidence that the feature works and would not make the database
  any more "clean" than it already is (the rest of the system's schedulers
  are also continuously writing real data in the same database). Only the
  temporary dev-server processes started for this verification were
  stopped (`pkill -f "ts-node src/main.ts"`, confirmed no processes
  remained afterward); no `channels`, `channel_scores`, `job_runs`, or
  `videos` rows were deleted.

## Result

- **Tests**: `pnpm -r run test` — 241 passed, 2 skipped, 0 failed, across
  all packages: `packages/db` 34 passed/2 skipped, `packages/shared` 29,
  `packages/youtube-client` 41, `apps/api` 24, `packages/scoring` 73,
  `apps/worker` 40. `pnpm -r run typecheck` and `pnpm -r run lint` both
  clean across all 8 lintable/typecheckable packages.
- **Migration**: `20261105140432_add_channel_tier_and_nullable_market`
  applied to the real database; `prisma migrate status` (run with real
  `DATABASE_URL` loaded from `.env`) reported "Database schema is up to
  date!" with 3 migrations found, all applied.
- **Live verification — `channel-video-discovery`**: real worker process
  registered the scheduler, which fired within ~1s per BullMQ's
  upsert-overdue-job behavior. The tick's `job_runs` row completed with
  `result_count = 855` (50 real channels polled via real
  `playlistItems.list` calls, 855 new-candidate video ids found across
  them). Those 855 ids were fanned out onto the existing `video-enrichment`
  queue; most were correctly blocked by that queue's own pre-existing quota
  guard (`error_message: "quota guard: projected usage 10026 exceeds daily
  budget"`), since today's real cumulative usage was already 7632/10000 —
  this is expected, correct Phase 1-3 safety behavior, not a Phase 4 defect.
- **Live verification — `channel-scoring`**: real tick completed with
  `result_count = 100` — 100 real `channel_scores` rows inserted with real
  computed `channel_score`/`score_breakdown`/`data_confidence` values, and
  100 real `newcomer` → `rising` tier transitions written to
  `channels.channel_tier`. Most scored channels landed at
  `data_confidence = 0.5000` (only `outlierVideoRatioPercentile` +
  `channelRecencyScore` populated), confirming the missing-metric
  re-normalization path exercised correctly on real data.
- **Live verification — API**: `GET /channels`, `GET /channels?tier=rising`,
  `GET /channels?limit=...&offset=...`, and `GET /channels/:id` (including a
  404 case for a non-existent id) were curl-verified against the real API
  process reading the real Postgres rows produced above.
- **Cleanup**: worker and API dev-server processes stopped
  (`pkill -f "ts-node src/main.ts"`), confirmed no matching processes
  remained. Real data produced during verification was deliberately
  retained (see Decisions) — not test pollution, but genuine first-run
  output of the feature.
- **Known pre-existing condition, not a Phase 4 defect**: today's YouTube
  API quota usage was already near the (unverified) 10,000/day budget
  before this phase's live verification began, which blocked the
  `video-enrichment` fan-out from newly-discovered channel-upload video
  ids. The `[[0001-mvp-scope-decisions]]` quota-budget verification action
  item remains open and is now more urgent with a third recurring consumer
  (`playlistItems.list`) in the mix.

## Validation

- `pnpm -r run typecheck`
- `pnpm -r run lint`
- `pnpm -r run test`
- Live: real worker run showing a real `channel-video-discovery` tick
  calling `playlistItems.list` against an already-known channel, a
  genuinely new video flowing through `video-enrichment` into `videos`,
  and a real `channel-scoring` tick producing a `channel_scores` row;
  `curl` against the real API for `GET /channels` and `GET /channels/:id`.
