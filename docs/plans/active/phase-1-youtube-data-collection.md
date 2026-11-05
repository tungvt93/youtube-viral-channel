# Execution Plan: Phase 1 — YouTube Data Collection

Date: 2026-11-05

## Status

Active

## Outcome

The collector can run — via a manual trigger or a basic automatic schedule —
and pull real candidate videos from the YouTube Data API v3 for the 4 seeded
markets (US, UK, DE, FR) using two discovery strategies (regional popularity +
recent-upload search), enrich each video and its channel, deduplicate by
`youtube_video_id`, and record `discovery_events` / `job_runs` /
`api_usage_logs`. A hard quota guard stops new API-calling jobs once the
configured daily budget would be exceeded. This matches PRD §25 Phase 1's
deliverable: "Có thể chạy collector và xem video được lưu trong PostgreSQL."

## Context

- `prd-youtube-viral-intelligence.md` §6 (discovery strategies 1 & 2, query
  budget, source attribution), §11.3 (FR-DIS requirements), §15 (schema,
  already implemented in Phase 0 — no schema changes expected), §17 (job
  queue/scheduling, idempotency, retry, concurrency/rate-limit), §18 (quota
  management), §20.1 (API key must never reach the frontend), §22.1 (log
  fields), §23.1–23.2 (unit/integration test expectations), §25 Phase 1 task
  list.
- [[0001-mvp-scope-decisions]] — markets = US/UK/DE/FR (not PRD's US/JP/KR
  example); multilingual seed queries (en, de, fr) from day one; prioritize
  Shorts (no PRD-defined mechanism — resolved below as a task-local decision);
  no Google Cloud project/API key created yet (user will create it); quota
  assumption 10,000 units/day, unverified.
- [[0002-no-vendor-outlier-finder]] — Shorts-detection heuristic to implement
  here, as part of video enrichment.
- `docs/plans/completed/phase-0-foundation.md` (currently still in
  `docs/plans/active/`) — Prisma schema (21 models), `apps/worker`
  `processors/`/`schedulers/`/`queues/` scaffolds, `apps/api` NestJS app, Pino
  logging, Docker Compose stack are all already in place with no business
  logic. This plan fills in the first real business logic on top of that
  scaffold.
- **Precondition not yet true:** no `YOUTUBE_API_KEY` exists yet. Creating the
  Google Cloud project and API key is a user action (requires the user's own
  Google account/console access) — tracked as an explicit prerequisite below,
  not something this plan can execute. Code in this plan is built and tested
  against a mocked YouTube API first; a live end-to-end run requires the real
  key.

## Scope

In scope:

- **User prerequisite (blocking live runs only, not code):** create a Google
  Cloud project, enable "YouTube Data API v3", create an API key, restrict it
  to that API, and put it in a local `.env` as `YOUTUBE_API_KEY` (never
  committed — `.gitignore` already covers `.env`).
- `packages/youtube-client`: a typed adapter over `search.list`,
  `videos.list` (batched by ID, ≤50 per call), and `channels.list` (batched by
  ID, ≤50 per call). No `playlistItems.list` yet — fetching a channel's recent
  uploads via its uploads playlist is Discovery Strategy 3 and is explicitly a
  Phase 4 task in the PRD roadmap, not Phase 1.
- Retry/backoff wrapper per PRD §17.4: exponential backoff + jitter for
  network timeouts; pause on `429`/quota-exceeded; limited retry on `5xx`;
  `400` (invalid query) marks the job failed, no retry; `403` is classified
  (key/permission vs. quota) and logged, no silent retry loop.
  Circuit breaker per §17.5 to stop hammering the API after repeated failures.
- BullMQ queues + processors in `apps/worker`: `discovery-regional`,
  `discovery-search`, `video-enrichment`, `channel-enrichment` (filling in the
  existing empty `processors/`/`queues/`/`schedulers/` scaffolds from Phase 0).
- A minimal scheduler: BullMQ repeatable jobs driven by each enabled
  `markets` row and its `discovery_queries.frequency_minutes`. Single worker
  instance for MVP — no leader-election/multi-instance complexity (task-local
  decision, see below).
- Idempotency keys per §17.3: `discovery:{strategy}:{market}:{query}:{date_bucket}`
  and `video-enrich:{video_id}:{metadata_version}`.
- Deduplication via the existing unique `youtube_video_id` constraint
  (upsert, not insert-or-fail).
- Write `discovery_events`, `job_runs`, and `api_usage_logs` rows for every
  discovery run / enrichment call, including `quota_estimate` per call type
  (search=100, list=1 per §6 cost notes).
- Quota guard: a configurable `daily_budget` (default 10,000, per
  [[0001-mvp-scope-decisions]]) read from `app_settings`; before enqueuing or
  running a job, sum today's `api_usage_logs.quota_estimate` and hard-stop if
  the job would exceed the budget. No %-threshold alerting yet (70/85/95% —
  that is a Phase 7 task per PRD §25).
- A minimal trigger/observability surface in `apps/api` — just enough to
  prove the pipeline, not the full REST CRUD surface (that is built
  incrementally alongside the Phase 6 dashboard):
  - `POST /discovery/queries/:id/run` — enqueue a manual run (FR-DIS-10).
  - `GET /discovery/jobs/:id` — check a job's status.
- Seed data script: 4 `markets` rows (US, UK, DE, FR; `enabled=true`;
  reasonable `default_language`/representative `timezone` per market — a
  task-local config choice, not product policy); 5–8 seed topics
  (e.g. Pets, Cooking, DIY, Gaming, Tech) each with localized query keywords
  in en (US/UK), de (DE), fr (FR); corresponding `discovery_queries` rows (one
  `most_popular` regional query + one `recent_search` query per topic per
  market), with conservative `max_pages_per_run` defaults to limit quota burn
  during initial testing.
- Shorts detection heuristic ([[0002-no-vendor-outlier-finder]] Follow-Up #1)
  as a pure function with unit tests, used during video enrichment to set
  `format_classification`.
- `YOUTUBE_API_KEY` loaded via `packages/config`/env, never logged — confirm
  the Pino redact list from Phase 0 covers it (add an explicit redact rule if
  not).

Out of scope (later phases, per PRD §25):

- Video/channel snapshot history and VPH/monitoring pipeline (Phase 2).
- Viral Score, Topic Momentum, percentile normalization (Phase 3).
- Channel Outlier baseline, uploads-playlist-based channel expansion
  (Discovery Strategy 3 beyond basic `channels.list` enrichment), watchlist
  (Phase 4).
- AI topic classification, topic aggregation (Phase 5).
- Dashboard UI, full `/api/v1` CRUD surface for markets/videos/channels, auth
  enforcement (Phase 6).
- Quota %-threshold alerting, production-slim Dockerfiles (Phase 7).
- Verifying the *real* Google Cloud quota number — tracked as an
  [[0001-mvp-scope-decisions]] follow-up the user performs once they have
  console access; this plan only makes the assumed `daily_budget` configurable.
- Deciding "prioritize Shorts" at the *scoring* level (Viral Score weighting)
  — that is Phase 3. This plan only resolves it at the *discovery* level (see
  Decisions below).

## Approach

1. Confirm the Phase 0 scaffold still runs (`docker compose up`, root
   `pnpm typecheck`) before adding logic on top of it.
2. Implement `packages/youtube-client` against mocked HTTP responses first
   (no real key needed) — adapter + retry/backoff + circuit breaker, with
   unit/integration tests per §23.1–23.2.
3. Implement the Shorts detection heuristic as an isolated pure function with
   unit tests (no API dependency beyond the already-fetched `videos.list`
   `player`/`contentDetails` fields).
4. Implement the quota guard against `api_usage_logs`/`app_settings`
   (pure logic + repository, testable without the real API).
5. Wire BullMQ queues/processors/scheduler in `apps/worker`, calling into
   `youtube-client` + quota guard + Prisma repositories for upsert/dedup.
6. Add the two minimal `apps/api` endpoints to trigger and observe jobs.
7. Write the seed script (markets, topics, discovery_queries) and run it
   against the Dockerized Postgres.
8. Only once all of the above passes with mocked responses: ask the user to
   create the real Google Cloud project/API key, drop it into `.env`, and run
   one real end-to-end discovery cycle for a single market/topic with a low
   page limit to conserve quota, then inspect the result via Prisma
   Studio/`psql`.

## Risks And Recovery

- **Real quota may differ from the assumed 10,000/day**: guard reads from a
  configurable `app_settings` value, not a hardcoded constant — easy to
  correct once the user checks Cloud Console. Recovery: lower the configured
  budget immediately if real runs show `403 quotaExceeded` before the guard
  would have stopped them, and treat that as evidence to update
  [[0001-mvp-scope-decisions]]'s assumption.
- **`search.list` is expensive (100 units/call)**: seed `discovery_queries`
  with a low `max_pages_per_run` (e.g. 1–2) by default; raise later once real
  quota is confirmed.
- **YouTube API regional/category quirks** (e.g. `mostPopular` category
  support varies by region): log raw response status per call; do not assume
  uniform behavior across US/UK/DE/FR — treat unexpected empty results as
  data, not a bug, until confirmed otherwise.
- **Google rate-limiting / sudden `403`/`429`**: circuit breaker opens after
  N consecutive failures and the scheduler backs off; manual trigger still
  works once the breaker closes.
- **Multilingual seed query quality** (non-native German/French keyword
  choices): acceptable risk for MVP — seed queries are data, not code, and
  can be corrected after inspecting first-run results without a new decision
  record.

## Progress

- [x] `packages/youtube-client`: adapter (`search.list`, batched
      `videos.list`, batched `channels.list`) + retry/backoff + circuit
      breaker, tested against mocked responses.
- [x] Shorts detection heuristic (pure function + unit tests).
- [x] Quota guard (daily budget read from `app_settings`, hard-stop logic)
      + unit tests.
- [x] Idempotency key generation (pure function + unit tests).
- [x] BullMQ queues: `discovery-regional`, `discovery-search`,
      `video-enrichment`, `channel-enrichment` + processors in
      `apps/worker`.
- [x] Scheduler: repeatable jobs from `markets` × `discovery_queries`
      frequency.
- [x] Prisma repository logic: upsert `Video`/`Channel` by
      `youtube_video_id`/`youtube_channel_id`; write `DiscoveryEvent`,
      `JobRun`, `ApiUsageLog` rows.
- [x] `apps/api`: `POST /discovery/queries/:id/run`,
      `GET /discovery/jobs/:id`.
- [x] Seed script: 4 markets, 5–8 topics × en/de/fr queries,
      `discovery_queries` rows with conservative page limits.
- [x] Pino redact rule confirmed/added for `YOUTUBE_API_KEY`.
- [x] Mocked-API test suite green end-to-end (discovery → enrichment →
      dedup → DB rows), no real key required.
- [ ] User creates real Google Cloud project + API key, supplies via `.env`.
- [ ] One real end-to-end run against a single market/topic, low page
      limit; result inspected via Prisma Studio/`psql`.

## Decisions

- 2026-11-05: "Prioritize Shorts" ([[0001-mvp-scope-decisions]] open item #4)
  resolved at the discovery level only: `discovery-search` jobs default to
  `videoDuration=short` in `search.list`. Regional (`most_popular`) discovery
  is left unfiltered by duration since the YouTube API's `mostPopular` chart
  does not support a duration filter. Scoring-level Shorts weighting (Viral
  Score) remains open for Phase 3, not decided here.
- 2026-11-05: No leader-election for the scheduler — a single `apps/worker`
  container is assumed for MVP (matches [[0001-mvp-scope-decisions]]
  "personal use" scope). Revisit if/when multiple worker replicas are ever
  needed.
- 2026-11-05: `apps/api` gets only two narrow endpoints in this phase (manual
  run trigger + job status), not the full `/api/v1` surface — the rest is
  built incrementally against real dashboard needs starting Phase 6, to
  avoid building unconsumed API surface now.
- 2026-11-05: Channel enrichment in this phase calls `channels.list` only
  (metadata + `uploads_playlist_id` stored for later use) — it does not yet
  fetch videos from that playlist; that discovery mechanism is Phase 4 per
  the PRD roadmap.
- 2026-11-05: Prisma access goes through `packages/db`, whose generator
  output lives at `packages/db/generated/client` (outside `src/`) rather than
  the default `node_modules/.prisma/client` location, so the client can be
  imported by both `@yvi/db`'s own built `dist/` and, directly, by
  `apps/api/prisma/seed.ts` (a `ts-node` script outside `apps/api`'s own
  `rootDir`/`include`, so it cannot go through `@yvi/db`'s build output
  without a dist-build-order dependency). All three library packages
  (`@yvi/db`, `@yvi/shared`, `@yvi/youtube-client`) needed `"declaration":
  true` added to their own `tsconfig.json` — the shared base config sets
  `declaration: false`, so their `package.json` `"types"` field pointed at a
  `.d.ts` that was never actually emitted; this silently degraded every
  cross-package import to `any` until a consumer's `tsc --noEmit` was run,
  which nothing in this repo had done yet for `apps/api`/`apps/worker` against
  their new `@yvi/db`/`@yvi/shared`/`@yvi/youtube-client` imports.
- 2026-11-05: `DiscoveryEvent` creation happens in the video-enrichment
  processor, not in discovery-regional/discovery-search, because
  `discovery_events` has NOT NULL foreign keys the discovery processors don't
  yet have resolved (the internal `video_id`), and `category_id`/dedup only
  become known after the `videos.list` enrichment call. Discovery processors
  only fan out `video-enrichment` jobs with `sourceRank`/`source` carried in
  the job payload; the enrichment processor writes one `DiscoveryEvent` per
  video after upserting it.
- 2026-11-05: BullMQ's `upsertJobScheduler` reuses one static `data` template
  on every repeat tick, so a `JobRun` id cannot be minted externally and
  injected per-tick the way it is for programmatically-enqueued
  video/channel-enrichment jobs. Fix: `DiscoveryJobData` carries only
  `discoveryQueryId`; each discovery processor creates its own `JobRun` at
  the start of processing, keyed by the BullMQ job's own `job.id`. For a
  manually-triggered run, `apps/api`'s `DiscoveryService.triggerRun` sets
  `job.id` explicitly to `discoveryIdempotencyKey(...)` (date-bucketed) via
  `queue.add(..., { jobId })`, so a same-day re-trigger is a no-op at both
  the BullMQ level (duplicate `jobId`) and the `JobRun` level (upsert by
  `id`). Scheduled/repeat-tick jobs get BullMQ's own auto-generated id since
  each tick is a legitimately new run, already deduplicated by
  `discoveryQuery.id` as the `jobSchedulerId`.
- 2026-11-05: `discovery_queries` has no unique constraint spanning
  `(market_id, topic_id, strategy)` (only non-unique `@@index`es), and adding
  one is a schema migration out of scope for this phase (Context: "no schema
  changes expected"). The seed script's `upsertDiscoveryQuery` helper does a
  manual `findFirst` + conditional `create`/`update` instead of Prisma's
  `upsert`; verified idempotent by re-running the seed twice against the real
  Dockerized Postgres and confirming row counts (4 markets, 6 topics, 48
  `discovery_queries`) stayed identical.

## Validation

- Focused proof: unit tests for the Shorts heuristic, quota guard,
  idempotency key generation (PRD §23.1); `pnpm lint` / `pnpm typecheck` /
  `pnpm test` green at the workspace root.
- Integration proof (mocked API): a discovery run produces `DiscoveryEvent`
  rows, enrichment produces/updates `Video`/`Channel` rows with no duplicate
  `youtube_video_id`, quota guard blocks a job once the mocked budget is
  exhausted, retried/duplicate discovery events are handled idempotently
  (PRD §23.2).
- End-to-end proof (real API, after user supplies a key): one real discovery
  run for one market/topic returns at least one video row in Postgres,
  visible via `psql \dt`/`SELECT` or Prisma Studio; `api_usage_logs` reflects
  the real quota consumed by that run.
- Repository-required checks: none configured yet (still no CI remote, per
  Phase 0's Result) — local-command proof only.

## Result

Progress items 1–10 are complete and validated against mocked API responses
and a real Dockerized Postgres. Items 11–12 (real `YOUTUBE_API_KEY` creation
and one live end-to-end run) are **not** done — no credential exists and none
was fabricated, per this task's explicit instruction. The plan's Status stays
`Active` until those two remain.

**What was built** (this session, on top of the already-complete
`packages/youtube-client`/Shorts-heuristic/quota-guard/idempotency-key work
from earlier sessions):

- `apps/worker/src/processors/{discovery-regional,discovery-search,video-enrichment,channel-enrichment}.ts`
  — the four BullMQ processors, each dependency-injected (`ProcessorDeps`) for
  testability, writing `JobRun`/`ApiUsageLog`/`DiscoveryEvent` rows and
  upserting `Video`/`Channel` via `packages/db` repositories.
- `apps/worker/src/schedulers/index.ts` — `registerDiscoverySchedulers`,
  creating one BullMQ `JobScheduler` per enabled `discovery_queries` row
  (`most_popular` → `discovery-regional`, else → `discovery-search`), keyed
  by `discoveryQuery.id`.
- `apps/worker/src/main.ts` — wires Redis connection, queues, the 4 workers,
  a health server, and scheduler registration on boot; graceful
  `SIGTERM`/`SIGINT` shutdown.
- `apps/api/src/discovery/{discovery.service.ts,discovery.controller.ts,discovery.module.ts}`
  — `POST /discovery/queries/:id/run` and `GET /discovery/jobs/:id`, wired
  into `AppModule`.
- `apps/api/prisma/seed.ts` — seeds 4 markets (US/GB/DE/FR), 6 topics
  (pets/cooking/diy/gaming/tech/comedy) × 3 localizations (en/de/fr) each,
  and 48 `discovery_queries` rows (one `most_popular` + one `recent_search`
  per topic per market), plus the `youtube_daily_quota_budget` `app_settings`
  row. Idempotent by design (manual `findFirst`+`create`/`update`, no schema
  change) — verified by running it twice against the real Dockerized
  Postgres with identical resulting row counts both times.
- Pino redact rules for `youtubeApiKey`/`YOUTUBE_API_KEY` (and their
  nested-field wildcard forms) added to both `apps/worker/src/common/logger.ts`
  and `apps/api/src/common/logger.config.ts`.
- `.env.example` documents `YOUTUBE_API_KEY` with a comment on how to obtain
  one (Google Cloud Console, YouTube Data API v3, restricted key).
- 9 new/rewritten test files (7 in `apps/worker`, 2 in `apps/api`), 24 test
  cases total, covering success paths, quota-guard-blocked paths, and
  API-failure paths for every new processor/scheduler/service/controller.
- Fixed a pre-existing, unrelated-to-this-task bug uncovered by actually
  running `tsc --noEmit` against the new `apps/api`/`apps/worker` code for
  the first time: `packages/db`, `packages/shared`, and
  `packages/youtube-client` each declared `"types": "dist/index.d.ts"` in
  `package.json` but never emitted one (`declaration: false` in the shared
  base tsconfig) — added `"declaration": true` to each of their own
  `tsconfig.json` files.

**Deviations from the plan / design changes made while implementing**
(all recorded above under Decisions, dated 2026-11-05):

- `DiscoveryJobData` carries only `discoveryQueryId`, not a pre-minted
  `jobRunId` — BullMQ's repeatable `JobScheduler` reuses one static `data`
  template per tick, so each discovery processor creates its own `JobRun`
  keyed by the BullMQ job's own `id` instead.
- `DiscoveryEvent` rows are written by the video-enrichment processor, not
  by discovery-regional/discovery-search, since the internal `video_id` FK
  and `category_id` aren't resolved until after the `videos.list` call.
- `discovery_events.source` uses the PRD's actual enum values
  (`most_popular`/`search`), not the originally-drafted
  `regional_most_popular`/`recent_search`.
- Seed script uses a manual `findFirst`+`create`/`update` helper for
  `DiscoveryQuery` rows instead of Prisma's `upsert`, since no unique
  constraint spans `(market_id, topic_id, strategy)` and adding one is a
  schema migration out of scope this phase.
- "UK" is seeded as ISO 3166-1 alpha-2 `GB` (YouTube API `regionCode`
  requirement), named "United Kingdom".

**Validation evidence** (all commands run from the repo root, real output
observed, not summarized from memory):

- `pnpm -r run lint` — all 9 workspace projects (`@yvi/web`, `@yvi/ai-client`,
  `@yvi/db`, `@yvi/scoring`, `@yvi/shared`, `@yvi/youtube-client`, `@yvi/api`,
  `@yvi/worker`) pass with zero ESLint errors/warnings.
- `pnpm -r run typecheck` — all 9 projects pass `tsc --noEmit` with zero
  errors (after the `declaration: true` fix above; `apps/api` and
  `apps/worker` typecheck their new code against real `.d.ts` output from
  `@yvi/db`/`@yvi/shared`/`@yvi/youtube-client`, not implicit `any`).
- `pnpm --filter @yvi/worker --filter @yvi/api run build` — both apps'
  production builds (`tsc -p tsconfig.build.json`, plus `prisma generate`
  for `apps/api`) complete with zero errors.
- `pnpm -r run test` — all test suites pass: `apps/worker` 9 files / 16
  tests, `apps/api` 3 files / 8 tests, plus all pre-existing package suites
  (`@yvi/youtube-client` 39, `@yvi/shared` 9, `@yvi/db` 7 passed + 2 skipped
  — the real-Postgres integration test self-skips when `DATABASE_URL` isn't
  set, by design). Total: 0 failures.
- `DATABASE_URL="postgresql://yvi:yvi@localhost:5440/yvi" pnpm --filter @yvi/db run test`
  — re-run with the real Dockerized Postgres reachable: the integration test
  (`src/repositories/videos.integration.test.ts`) actually executes (not
  skipped) and passes — 5 files / 9 tests, 0 skipped. This is the "≥1
  integration test against real Dockerized Postgres" proof for the quota
  guard/video-repository logic.
- `pnpm --filter @yvi/api run prisma:seed` — run twice against the real
  Dockerized Postgres (`apps/api/.env` → `localhost:5440`). First run:
  inserted 4 `markets`, 6 `topics`, 18 `topic_localizations`, 48
  `discovery_queries` (24 `most_popular` + 24 `recent_search`), 1
  `app_settings` row — all confirmed via direct `psql` queries. Second run:
  identical counts (4/6/48), confirming idempotency.

**What is explicitly NOT done, and the exact next action required from the
user:**

Progress items 11 and 12 remain unchecked. No `YOUTUBE_API_KEY` exists and
none was fabricated. To complete Phase 1:

1. Create a Google Cloud project, enable "YouTube Data API v3", create an
   API key, restrict it to that API, and put it in `apps/api/.env` and
   `apps/worker/.env` (or wherever the worker process reads its env from) as
   `YOUTUBE_API_KEY=<the key>`.
2. Start `apps/worker` (e.g. `pnpm --filter @yvi/worker run start:dev`) and
   `apps/api` (`pnpm --filter @yvi/api run start:dev`) against the running
   Dockerized Postgres/Redis.
3. Trigger one real, low-quota-cost discovery run for a single market/topic.
   Find a seeded `discovery_queries.id` first (e.g.
   `psql ... -c "select id, market_id, topic_id, strategy from discovery_queries where strategy='recent_search' limit 1;"`),
   then:

   ```bash
   curl -X POST http://localhost:3001/discovery/queries/<DISCOVERY_QUERY_ID>/run
   ```

   This returns `{"jobId": "...", "status": "queued"}`. Poll it with:

   ```bash
   curl http://localhost:3001/discovery/jobs/<JOB_ID>
   ```

   until `status` is `completed` (or `failed`, in which case check
   `apps/worker`'s logs and `errorMessage` on the `JobRun` row).
4. Inspect the result: `SELECT * FROM discovery_events ORDER BY discovered_at DESC LIMIT 10;`
   and `SELECT * FROM videos ORDER BY created_at DESC LIMIT 10;` via `psql`
   or Prisma Studio, and check `api_usage_logs` for the real quota consumed.
5. Once confirmed, check off Progress items 11–12 in this document and move
   its Status to `Completed` (or leave `Active` if further Phase 1 follow-up
   is identified from the real run's results).
