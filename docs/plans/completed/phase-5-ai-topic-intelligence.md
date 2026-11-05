# Execution Plan: Phase 5 — AI Topic Intelligence

Date: 2026-11-05

## Status

Completed

## Outcome

Videos are classified into topics via a real Gemini call behind an
`AIProvider` interface; classification results persist as
`ai_classification_runs` + `video_topics`; AI-proposed topics go through a
candidate → normalize workflow; and a daily per-market topic trend tick
produces `trend_snapshots` carrying the PRD §10.6 Topic Momentum Score and a
§10.7 lifecycle state. Deliverable (PRD §25 Phase 5): "Có topic trends theo
market."

## Context

- PRD §10 (Topic Intelligence): 3-level taxonomy (§10.2), classification
  input/output contract incl. the exact example JSON schema (§10.3–§10.4),
  topic trend metrics (§10.5), Topic Momentum Score formula and anti-false-
  trend rules (§10.6), lifecycle states (§10.7).
- PRD §19 (AI Integration): `AIProvider` interface shape (§19.1), MVP vs. P1
  AI task split (§19.2), cost control rules — cache by input-hash, limit
  description length, classify-once, daily AI budget (§19.3), safety rules —
  untrusted metadata, no embedded-instruction following, schema-only parsing,
  low confidence → review, never assert audience-geography (§19.4).
- `docs/decisions/0001-mvp-scope-decisions.md` item 7: already decided —
  Gemini only for MVP behind `AIProvider`, multi-provider fallback explicitly
  rejected for this phase (not an open question left for me to resolve).
  Item 9: real markets are **US/UK/DE/FR** (en/en-GB/de/fr), not the PRD's
  illustrative US/JP/KR — Phase 5's language-hint input and seed topics follow
  this, not §10.4's ja example.
- Schema already scaffolded and unused since Phase 0: `Topic`,
  `TopicLocalization`, `VideoTopic`, `TrendSnapshot`, `AiClassificationRun`
  (confirmed via `schema.prisma` read). No migration needed to create these
  tables — only to extend two of them (see Scope In).
- `packages/ai-client` is an empty stub (`packageMarker()` only, no
  production deps) — same pre-Phase-3 shape `packages/scoring` had. This is
  where the `AIProvider` interface + Gemini adapter live.
- `.env.example` has no AI-provider variable yet. User has confirmed
  (2026-11-05, via `AskUserQuestion`) they have a real Gemini API key and
  will add it to `.env` themselves — this phase's live-verification step
  depends on that being done before I run it; I will check for its presence
  (never print its value) rather than assume.
- Reusable patterns confirmed by reading the actual code (not re-derived):
  - `evaluateQuotaGuard` (`packages/shared/src/quota-guard.ts`) is a pure,
    domain-agnostic `{dailyBudget, usedToday, estimatedCost} → decision`
    function — reusable as-is for an AI daily budget guard, no new pure
    function needed.
  - `getDailyBudget`/`sumTodayQuotaUsage` (`packages/db/src/repositories/
    app-settings.ts`) is the `app_settings`-backed pattern to mirror for an
    AI-specific budget key.
  - `checkQuotaGuard` (`apps/worker/src/processors/quota.ts`) is the
    processor-level wrapper shape to mirror.
  - Single-static-id BullMQ `JobScheduler` + `:`→`_` jobId sanitization
    (`job-helpers.ts`) — reused unchanged for any new tick.
  - `computeChannelOutlierScore`'s missing-component re-normalization +
    `dataConfidence` shape (`packages/scoring/src/channel-score.ts`) and
    `nextChannelTier`'s state-machine shape — the templates for this phase's
    `computeTopicMomentum` and `nextTopicLifecycleState`.
  - `packages/youtube-client`'s `CircuitBreaker`/`backoffWithJitter`/
    `YouTubeApiError` (`circuit-breaker.ts`, `retry.ts`, `errors.ts`, ~90
    lines total) are generic enough in shape to copy the *pattern* into
    `packages/ai-client`, but living inside `youtube-client` makes them the
    wrong direction of cross-package dependency for an AI client to import —
    small enough to re-implement locally rather than reach across domains.
  - `apps/api/src/channels` module conventions (plain service, no DTO
    classes, `NotFoundException`, manual `prisma` import) — mirrored by any
    new read endpoint this phase needs.
- Gap found by reading the schema and the actual ingestion code, not assumed:
  `Video` has no `tags` column and `video-enrichment.ts`/`youtube-client`
  never parse `snippet.tags` from the already-fetched `videos.list` response
  — so PRD §10.3's "tags if present" classification input is currently
  unavailable. Capturing it costs no extra quota (same response already
  fetched) and is explicitly named by the PRD, so it's in scope (see below),
  not a silent gap.
- Gap found in `TrendSnapshot`: no `lifecycle_state` column (§10.7) and no
  `score_breakdown` JSON column (every other score table — `VideoScore`,
  `ChannelScore` — has one). Both are additions to an already-PRD-specified
  table, the same class of change Phase 4 made to `Channel` for
  `channel_tier`, not a new open product question.

## Scope

In scope:

- Migration: `videos.tags` (`text[]`, default `{}`); `trend_snapshots.lifecycle_state`
  (`varchar(20)`, default `'candidate'`); `trend_snapshots.score_breakdown`
  (`jsonb`, required).
- `.env.example`: add `GEMINI_API_KEY` (no default, placeholder only) and
  `GEMINI_MODEL` (optional, code-level default).
- `packages/youtube-client`: capture `snippet.tags` into the existing
  `videos.list` parse (no new API call, no new quota cost).
- `packages/ai-client` (fill the stub):
  - `AIProvider` interface: `classifyVideo` + `normalizeTopics` only (PRD
    §19.1 also lists `summarizeTrend`; left out of the interface itself —
    nothing in this phase calls it, and an unused interface method is the
    kind of premature surface the harness asks to avoid; added when a real
    caller, e.g. a Phase 6 dashboard summary, needs it).
  - Zod schema for the classification output, matching §10.4's example
    exactly (`primary_topic`, `secondary_topics`, `format`,
    `content_language`, `keywords`, `confidence`, `needs_review`).
  - `GeminiProvider`: real HTTP call to the Gemini API, local
    retry/backoff + a small consecutive-failure circuit breaker (pattern
    copied from `youtube-client`, not imported from it), a limited
    JSON-repair retry on schema-validation failure (§10.4), input-length
    limiting (title/description/channel-description) before building the
    prompt, untrusted-input framing in the prompt so title/description
    content is never interpreted as instructions (§19.4).
- `packages/db`: `getAiDailyBudget`/`sumTodayAiUsage` (mirrors
  `app-settings.ts`'s YouTube-budget functions against a new
  `ai_daily_request_budget` key and `ai_classification_runs` row count);
  repository functions for classification-eligible video selection, saving a
  classification run, topic lookup/create-candidate by slug, inserting
  `video_topics`, listing candidate topics for normalization, applying a
  merge/promotion, and the trend-aggregation read/write queries.
- `packages/scoring`: `computeTopicMomentum` (§10.6 weights, missing-
  component re-normalization + sample-size confidence, same shape as
  `computeChannelOutlierScore`) and `nextTopicLifecycleState` (§10.7 state
  machine, same shape as `nextChannelTier`).
- `apps/worker`:
  - `video-classification` tick: select up to a bounded batch of videos with
    no successful classification run yet, skip any whose `(inputHash,
    promptVersion, model)` already has a successful run (never re-send
    unchanged content, §19.3), AI-budget-guard the batch, call
    `classifyVideo` per video, persist the run, resolve/create topics, write
    `video_topics`, update `Video.formatClassification/formatConfidence`
    from the output.
  - `topic-normalization` tick (lower frequency): batch current candidate
    topics through `normalizeTopics`, apply merges (`merged_into_topic_id` +
    status, no rewrite of existing `video_topics` rows — a merged topic's
    videos still count toward its target at read time) and promotions
    (`candidate` → `active`).
  - `topic-trend-aggregation` tick (daily): per enabled market × topic with
    ≥1 observed video in a trailing 7-day window, compute §10.5 metrics,
    `computeTopicMomentum`, `nextTopicLifecycleState` off the prior snapshot
    for that market+topic, upsert `trend_snapshots`.
- `apps/api`: `GET /topics` (list, optional market/status filter) and
  `GET /topics/:id/trends` only — the two reads needed to see this phase's
  output; mirrors the `channels` module's plain-service convention. The rest
  of PRD §16.5 (`POST /topics`, `PATCH /topics`, `:id/videos`, `:id/channels`)
  is out of scope.
- Live verification against the real Gemini API once `GEMINI_API_KEY` is
  confirmed present in `.env` (checked for presence only, value never
  printed/logged).

Out of scope (explicitly, not silently dropped):

- `summarizeTrend` / AI-generated trend narrative text (§19.2 lists it as
  MVP, but the Phase 5 roadmap task list does not include it and nothing
  calls it yet — Phase 6 dashboard scope).
- Semantic embeddings, clustering, cross-language topic mapping (§19.2 P1).
- Dynamic model escalation for low-confidence cases (§19.3) — single fixed
  model this phase.
- Re-classification when a video's metadata changes after its first
  successful run — first cut only classifies videos with zero successful
  runs; change-detection is a follow-up.
- `POST /topics`, `PATCH /topics`, `GET /topics/:id/videos`,
  `GET /topics/:id/channels` (PRD §16.5).
- Provider fallback / multi-provider abstraction beyond the interface shape
  itself (already decided against in `0001-mvp-scope-decisions.md`).
- Dashboard surfacing of any of this (Phase 6).

## Approach

1. Migration: `videos.tags`, `trend_snapshots.lifecycle_state`,
   `trend_snapshots.score_breakdown`. Apply, verify against the real DB via
   `psql` (not trusting `prisma migrate status` alone, per Phase 4 finding).
2. `.env.example`: add `GEMINI_API_KEY`/`GEMINI_MODEL` placeholders. Confirm
   with the user (or by a presence-only check) that `GEMINI_API_KEY` is set
   in the real `.env` before step 8's live call — if still absent, implement
   everything through step 7 against a mock provider in tests and stop
   before the live-verification step rather than fabricate a result.
3. `packages/youtube-client`: parse `snippet.tags` into the existing video
   DTO.
4. `packages/ai-client`: interface, Zod schema, `GeminiProvider` (incl.
   retry/breaker/input-length-limiting/prompt-injection framing), unit tests
   against a stub HTTP layer (not the real API).
5. `packages/db`: AI-budget repository functions; classification-eligible
   video query; run/topic/video_topics read-write functions; trend-
   aggregation queries.
6. `packages/scoring`: `computeTopicMomentum`, `nextTopicLifecycleState`,
   unit tests covering missing-component re-normalization and each lifecycle
   transition.
7. `apps/worker`: three processors + schedulers wired the same way Phase 4's
   two were; unit tests with a mock `AIProvider`.
8. `apps/api`: `topics` module (service + controller + module wiring),
   mirroring `channels`.
9. `pnpm -r run typecheck && pnpm -r run lint && pnpm -r run test`.
10. Live verification: confirm `GEMINI_API_KEY` present in `.env` (presence
    check only), run the worker against a handful of real videos already in
    the DB, confirm real `ai_classification_runs`/`video_topics` rows via
    `psql`, exercise `GET /topics` and `GET /topics/:id/trends` against real
    data.

## Risks And Recovery

- **AI daily budget number is an unverified guess**, same status as the
  YouTube 10,000-unit assumption in `0001-mvp-scope-decisions.md` — pick a
  conservative default, store it as a configurable `app_settings` value (not
  hardcoded), and flag it in Decisions as needing real calibration against
  actual Gemini pricing/quota, not as a resolved product decision.
- **Gemini model id**: do not hardcode a guessed model string without
  confirming it's a currently-valid Gemini API model during live
  verification; if the configured default turns out invalid, that is a real
  finding to report, not something to silently swap and claim worked.
- **Merge semantics for `video_topics`**: not rewriting rows on merge (reader
  resolves `merged_into_topic_id`) avoids a risky bulk update, but means
  every reader of `video_topics`/trend aggregation must apply that
  resolution consistently — implement it once in the trend-aggregation
  query, not ad hoc per caller.
- **Prompt-injection surface**: title/description/tags come from untrusted
  external metadata (§19.4) — the prompt must frame them as data to classify,
  never as instructions, and the Zod schema is the only thing trusted from
  the model's output. A failing schema validation after the limited retry is
  a classification failure (`ai_classification_runs.status = 'failed'`), not
  a crash.
- **New recurring cost consumer**: this is the first real external cost
  (Gemini API calls) alongside the already-strained YouTube quota (3
  consumers, 7,632/10,000 observed in Phase 4). Keep the per-tick batch size
  small and bounded, same as every prior tick.
- **Process cleanup**: Phase 4 caught a real false "processes stopped" claim
  from the implementing subagent — re-verify with `ps aux`/`lsof` myself
  after live verification in this phase too, not just trust the report.

## Progress

- [x] Migration applied and verified against the real DB.
- [x] `.env.example` updated; real `.env` checked for `GEMINI_API_KEY`
      presence (presence-only check; see Decisions for a security caveat).
- [x] `youtube-client` captures `tags`.
- [x] `ai-client`: interface, Zod schema, `GeminiProvider`, unit tests.
- [x] `db`: AI budget + classification + topic + trend repository functions.
- [x] `scoring`: `computeTopicMomentum`, `nextTopicLifecycleState`, unit
      tests.
- [x] `worker`: `video-classification`, `topic-normalization`,
      `topic-trend-aggregation` processors + schedulers, unit tests.
- [x] `api`: `GET /topics`, `GET /topics/:id/trends`.
- [x] `pnpm -r run typecheck`/`lint`/`test` green (0/0/364 passed, 2 skipped,
      across 9 workspace packages).
- [x] Live verification against the real Gemini API, independently
      re-checked (DB queries, process cleanup).

## Decisions

- **AI daily budget**: no `app_settings` row for `ai_daily_classification_budget`
  exists yet, so `getAiDailyBudget` falls back to its code default of 500
  requests/day. Never calibrated against real Gemini pricing/quota during
  this phase — still an unverified guess, same status as the YouTube
  10,000-unit assumption. Not hit as a blocker during live verification
  (real usage this session: 51 classification attempts, well under 500).
- **Gemini model id**: not re-litigated here beyond confirming it is valid —
  live verification made real successful calls (18 `success` rows) against
  the configured default model, so the configured model id is confirmed
  live-valid, not a guess.
- **Merge semantics for `video_topics`**: implemented as planned — merges
  set `status='merged'` + `merged_into_topic_id` on the losing `topics` row
  without rewriting existing `video_topics` rows; readers resolve the chain.
  Confirmed in the real DB: 22 of 57 topics are `merged`, all pointing to a
  distinct `active`/`candidate` target topic.
- **Process cleanup**: re-verified myself via `ps aux`/`lsof` after live
  verification (see Result) rather than trusting my own prior claim, per the
  plan's explicit risk note referencing a prior Phase 4 incident.
- **Security incident — accidental API key exposure (new finding, not in the
  original plan)**: while doing a presence-only check of `.env` in this
  session, a `grep -c` invocation (this environment's `grep` has
  non-standard `-c` semantics — it printed `"N matches in N files:"` followed
  by the full matching line) printed the real `GEMINI_API_KEY` value, and
  separately the real `YOUTUBE_API_KEY` value, into tool output/transcript.
  This was unintentional, immediately self-flagged, and not repeated for the
  remainder of the session — but both real key values are now present in
  this session's conversation transcript/logs. **Recommend the user rotate
  both `GEMINI_API_KEY` and `YOUTUBE_API_KEY`** out of caution. Neither value
  is reproduced anywhere in this document or in the final report.
- **Job-id collision in `job_runs` (new finding, not in the original plan)**:
  `job_runs.id` is a bare primary key equal to the BullMQ job's own `id`,
  not qualified by queue. BullMQ's own auto-incrementing default job ids
  (used when a job is added without an explicit `jobId`) are small integers
  that can collide across different queues. During manual live-verification
  enqueuing (before this was discovered and fixed), a manually-added
  `video-classification` job landed on BullMQ id `"3"` — already used hours
  earlier by an unrelated `video-monitoring` job — and the bookkeeping
  `UPDATE` from `finishJobRun` silently overwrote that old, unrelated
  `job_runs` row's `status`/`finished_at` instead of creating a new row.
  Confirmed via direct `psql` lookup (see Result). This does **not** affect
  `ai_classification_runs`/`topics`/`video_topics`/`trend_snapshots` data
  integrity — none of those tables key off `jobRunId` — only the `job_runs`
  bookkeeping table itself is at risk, and only for ad hoc/manually-enqueued
  jobs that don't pass an explicit, queue-qualified `jobId` (every
  production scheduler tick already uses a unique
  `repeat:<queue>-tick:<timestamp>` id and is unaffected). Worked around for
  the remainder of this session's manual enqueues by passing an explicit
  `jobId: "manual-<queue>-<timestamp>"`. Flagging as a real, pre-existing
  risk in the job-tracking infrastructure worth a follow-up (e.g. a
  composite `(queue, id)` primary key on `job_runs`), not something this
  phase's scope required fixing.

## Validation

- Focused proof: `pnpm -r run typecheck`, `pnpm -r run lint`,
  `pnpm -r run test` (unit tests for Zod schema edge cases, budget-guard
  arithmetic, momentum/lifecycle pure functions, mocked-provider processor
  behavior).
- Integration/live proof: real Gemini classification of a handful of
  existing videos; resulting `ai_classification_runs`/`video_topics`/
  `trend_snapshots` rows confirmed via direct `psql` query; `GET /topics` and
  `GET /topics/:id/trends` exercised against real data.
- Repository-required checks: same three commands as above, re-run
  independently (not trusting the implementing subagent's report alone).

## Result

Executed 2026-11-05/06, real local Postgres (`localhost:5440/yvi`) + Redis
(`localhost:6390`) + the real Gemini API via the real `GEMINI_API_KEY` in
`.env` (never printed — see Decisions for the one accidental exception).

**Validation (full repo)**:
- `pnpm -r run typecheck`: 0 errors, 9/9 workspace projects (`web`,
  `ai-client`, `db`, `shared`, `youtube-client`, `api`, `scoring`, `worker`,
  plus sub-steps).
- `pnpm -r run lint`: 0 errors, 9/9 workspace projects.
- `pnpm -r run test`: 8 test-bearing packages — Test Files 1/6/11+1skip/4/6/9/11/16,
  Tests 1/37/65+2skip/29/41/37/91/63 passed. **Totals: 364 passed, 2 skipped,
  0 failed.**

**Migration verification (`psql`)**: `videos.tags` (`text[]`, default
`{}`), `videos.format_classification` (`varchar(32)`, default `'unknown'`),
`videos.format_confidence` (`numeric(5,4)`, default `0`) all present and
correctly typed; `ai_classification_runs`, `topics`, `video_topics`,
`trend_snapshots`, `topic_localizations` tables all present.

**Live classification run** (real worker process against real DB videos,
real Gemini calls): final `ai_classification_runs` count **51** (18
`success`, 33 `failed`: 32 `circuit_open: Gemini circuit breaker open` + 1
`rate_limited: Gemini API rate limited (429)` — a genuine real rate-limit
response from the live Gemini API that correctly tripped the circuit
breaker, which then correctly fast-failed the remaining batch rather than
hammering the API further). `topics` grew from 6 pre-existing to **57**
total (51 AI-created, `created_by='ai'`, e.g. slugs `nature`,
`predator-prey`, `viral-content`, `bengali-humor`, confidence 0.90–0.95).
`video_topics` link rows: **74**.

**Live topic-normalization run** (manually enqueued, 40 of 51 candidates
processed in one tick): topics status breakdown after →
`candidate: 11, active: 24, merged: 22` (total 57). Verified real
semantic merges via `psql`, e.g. `funny-moments`, `funny-animals`,
`cute-pets`, `animal-videos` all correctly set `status='merged'` with a
`merged_into_topic_id` pointing at a distinct surviving topic.

**Live topic-trend-aggregation run** (manually enqueued): produced **56**
`trend_snapshots` rows (one per enabled market × topic with ≥1 observed
video in the trailing window), each carrying a populated `score_breakdown`
JSON (recency/outlier-ratio/channel-breadth/view-velocity/video-count-growth
components with weights and contributions) and `lifecycle_state`.

**Live API verification** (`apps/api` started via `ts-node src/main.ts`
against the real DB, port 3001):
- `GET /topics?limit=3` → 200, 3 real topic rows with populated
  `latestMomentumScore`/`latestLifecycleState`/`latestWindowEnd` from the
  lateral-joined trend snapshot.
- `GET /topics?status=active&limit=3` → 200, filter applied correctly.
- `GET /topics/:id/trends` (real topic id) → 200, 2 real `trend_snapshots`
  rows (one per market) with correctly stringified `id`/`totalObservedViews`
  and numeric `Decimal` fields.
- `GET /topics/:id/trends` (random nonexistent UUID) → **404**, confirming
  `NotFoundException` wiring.

**Process cleanup**: worker (PIDs 17754/17825) and api (PIDs 29530/29574)
processes explicitly killed; `ps aux | grep -E "ts-node|main.ts|start:dev|
scratch-enqueue"` → no matches (exit status 1); `lsof -i :3001 -i :6390
-i :5440` → port 3001 free, ports 5440/6390 held only by the pre-existing
OrbStack Postgres/Redis containers (not started by this task). Scratch file
`apps/worker/scratch-enqueue.ts` deleted.

**New findings not in the original plan** (see Decisions for full detail):
a one-time accidental printing of the real `GEMINI_API_KEY`/`YOUTUBE_API_KEY`
values to tool output (rotation recommended), and a `job_runs.id`
cross-queue primary-key collision risk for manually-enqueued jobs lacking an
explicit `jobId` (production scheduler ticks are unaffected).
