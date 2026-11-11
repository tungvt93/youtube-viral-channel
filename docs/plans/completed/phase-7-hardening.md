# Execution Plan: Phase 7 — Hardening (code-only slice)

Date: 2026-11-06

## Status

Completed

## Outcome

`apps/api` gains a global exception filter, a CORS allowlist + `helmet`, and
rate limiting extended to every mutating route (not just the two routes that
have it today). Admin-mutating requests are recorded in a new audit log.
Two new alert types — `quota_threshold` and `job_backlog` — are produced by
a new, dedicated periodic worker tick and surfaced through the existing
Phase 6c `alerts` table/API/page, unchanged. The main list queries get a
query-plan/index review. A new `apps/e2e` package proves the PRD §23.3
end-to-end flow against a real (test) Postgres + Redis, with CI gaining its
first-ever database service containers to run it on every push.

Explicitly out of scope (user decision, 2026-11-06): real load testing,
Sentry account/DSN wiring, VPS/staging provisioning, real database backup
mechanism/destination, YouTube API policy review, and the 7-day
production-calibration run. These PRD §25 Phase 7 items all require external
accounts, infrastructure choices, or elapsed calendar time that cannot be
decided or executed from inside a coding session — they are left as
follow-ups pending the user's infrastructure decisions.

## Context

- PRD §25 Phase 7 task list (verbatim, lines 1987-1998): "E2E tests.",
  "Load test các list APIs.", "Check query plans/indexes.", "API quota
  alert.", "Job backlog alert.", "Error tracking.", "Database backup.",
  "Review YouTube API policies.", "Deploy VPS/staging.", "Chạy thử 7 ngày và
  hiệu chỉnh score." The user explicitly scoped this plan to the
  code-internal subset: E2E tests, quota/job-backlog alerts, query/index
  review, plus PRD §20.4's application-security list (which Phase 7 is the
  natural home for, per phase-6a's plan already forward-referencing it —
  see below). Load test, error tracking (Sentry), backup, YouTube policy
  review, VPS/staging, and the 7-day run are out of scope by explicit user
  decision (2026-11-06), each requiring an external account/provider/VPS
  choice or elapsed calendar time this plan cannot supply.
- PRD §20.4 Application security (read in full this session): password
  hashing, CSRF, CORS allowlist, rate limiting, input validation, SQLi
  protection via ORM, audit log for admin actions, dependency scanning,
  backup encryption. Password hashing/SQLi-via-ORM/input-validation are
  already satisfied by Phases 0-6 (bcrypt in `auth.service.ts`, Prisma
  everywhere, manual `parseListQuery`-style parsing). CSRF is not
  applicable in this architecture (session cookie is `httpOnly`+`sameSite`,
  no cross-site form posting target — confirmed by reading
  `apps/api/src/auth/session-auth.guard.ts` and the login flow already read
  in a prior segment). Dependency scanning and backup encryption are
  external-tooling/infra decisions, out of scope here. That leaves CORS
  allowlist, rate limiting, and audit log as this plan's security scope.
- `docs/plans/completed/phase-6a-dashboard-foundation.md` already
  forward-referenced "Rate limiting, admin audit log (§20.4) — Phase 7
  hardening" and `phase-1-youtube-data-collection.md` forward-referenced
  "Quota %-threshold alerting (Phase 7)" — this plan is where both land.
- `apps/api/src/main.ts` (read in full this session, 13 lines): currently
  only `NestFactory.create` + Pino logger + `app.listen`. No CORS config,
  no `helmet`, no global exception filter — confirmed nothing to preserve,
  this is greenfield within the file.
- `apps/api/src/common/rate-limit.guard.ts`/`rate-limit.decorator.ts` (read
  in full this session): a working, already-tested in-memory per-process
  guard that is a no-op unless a route carries the `@RateLimit` decorator
  (`reflector.getAllAndOverride` returns `undefined` → `canActivate`
  returns `true` immediately). Currently only wired via `@UseGuards
  (RateLimitGuard)` + `@RateLimit(...)` on two routes
  (`discovery.controller.ts`'s run-query route,
  `videos.controller.ts`'s export route), with `RateLimitGuard` listed as a
  local provider in each of those two modules only. `app.module.ts` (read
  in full this session) registers exactly one global `APP_GUARD`
  (`SessionAuthGuard`) today — no rate limiting is global. Because the
  guard is already a safe no-op without the decorator, it can be
  registered as a second global `APP_GUARD` with zero behavior change to
  the two routes already using it, then every other mutating route gets
  `@RateLimit(...)` added individually.
- `apps/api/prisma/schema.prisma` grepped this session for `AuditLog`: zero
  matches — no audit-log model exists yet. `model User` (line 428)
  confirms a `role` column (`VarChar(20)`, default `"admin"`) exists to
  attribute an audited action to.
- `packages/db/src/repositories/alerts.ts` (read in full this session, 57
  lines): `createAlertIfDue`/`listAlerts`/`getAlertById`/`markAlertRead`
  take plain `alertType`/`entityType`/`entityId`/`message`/`severity`
  strings with no entity-type-specific constraint — confirmed reusable
  as-is for `quota_threshold`/`job_backlog` without any change to
  `packages/db` or `apps/api`'s `alerts` module/page. `Alert.entityType`
  is `VarChar(20)`, `alertType` is `VarChar(40)` — `"quota_threshold"` (15
  chars) and `"job_backlog"` (11 chars) fit; `entityType` values `"system"`
  and `"queue"` fit.
- `apps/worker/src/schedulers/index.ts` + `queues/index.ts` + `main.ts`
  (read in full this session): every existing tick is a dedicated
  `Queue`/`Worker`/scheduler triple registered in `main.ts`, each processor
  computing only what it needs with no shared "system monitoring" concept.
  Unlike Phase 6c's three alert triggers, there is no existing periodic
  tick that already has quota usage or queue depth in scope — `quota.ts`
  only exports pure pre-spend guard checks (`checkQuotaGuard`/
  `checkAiBudgetGuard`) called synchronously *before* a job spends budget,
  not a periodic observability tick. A new dedicated tick is therefore
  needed (see Decisions) rather than piggybacking, unlike Phase 6c.
- `packages/shared/src/quota-guard.ts` (read in full this session):
  `evaluateQuotaGuard` is a pure allow/deny check with no banding. The
  70/85/95% banding (`quotaBand`, `QUOTA_WARN_PERCENT`/`QUOTA_HIGH_PERCENT`/
  `QUOTA_CRITICAL_PERCENT`) exists only as a private, non-exported function
  inside `apps/api/src/system/system.service.ts` today — duplicating it
  into `apps/worker` would drift from `GET /system/quota`'s own band.
  Extracting it into `packages/shared` (used by both) is in scope here.
- `.github/workflows/ci.yml` (read in full this session, 26 lines):
  `lint`/`typecheck`/`test` only, no Postgres/Redis service container, no
  `DATABASE_URL`/`REDIS_URL` env. Grepped `packages/db`/`apps/*` test files
  for `skipIf`/`process.env.CI`/`.skip` patterns: zero matches — meaning
  the existing `pnpm -r run test` suite that currently passes in CI does
  not depend on a live Postgres/Redis at all (unit-level, Prisma-client
  mocked or not exercised); the "live walkthrough" integration proof used
  in Phases 1-6c is a manual step, never part of automated CI. A new
  `apps/e2e` suite needs a live Postgres (and Redis, since
  `apps/api/src/discovery/discovery.service.ts` talks to Redis directly to
  enqueue a job) — this is the first time this repo's CI would provision
  either. User decision (2026-11-06): add Postgres+Redis service
  containers to `ci.yml` rather than keep the E2E suite manual-only.
- `pnpm-workspace.yaml` confirms `apps/*` is a workspace glob — a new
  `apps/e2e` package is picked up by `pnpm -r run test`/`lint`/`typecheck`
  automatically, no workspace config change needed.
- No `helmet`, `@nestjs/throttler`, `playwright`, or `supertest` exists
  anywhere in the monorepo today (grepped all `package.json` files) —
  `helmet` is a new dependency for `apps/api`; rate limiting continues
  using the existing hand-rolled guard (no new throttler dependency); the
  E2E suite uses `vitest` + plain `fetch` against a real running `apps/api`
  process, matching this repo's existing no-browser-automation convention,
  not Playwright/supertest (see Decisions).
- `docs/patterns/encoding-invariants.md` (re-read this session): explicit
  constraint not to "install hooks, select a CI provider, prescribe a merge
  policy, or mutate branch protection" without authority. Adding a service
  container to the existing single CI job is an execution-environment
  change to a workflow this repo already owns and runs, not a new
  CI-provider/merge-policy decision — in scope under the user's explicit
  go-ahead above, not a boundary this plan is crossing unilaterally.
- Completed precedent: `docs/plans/completed/phase-6c-alerts.md` for the
  Decisions-section discipline and the independent-verification pattern to
  repeat after implementation (same as every phase since 6a).

## Scope

In scope:

- `apps/api`:
  - Global exception filter (`common/http-exception.filter.ts`, `APP_FILTER`)
    — unified JSON error shape (PRD §16.8) for any unhandled exception, logged
    via the existing Pino logger.
  - `main.ts`: add `helmet()` middleware and a CORS allowlist (origins from a
    new `CORS_ALLOWED_ORIGINS` env var, comma-separated; falls back to
    disallow-all-cross-origin if unset — see Decisions).
  - Register `RateLimitGuard` as a second global `APP_GUARD` in
    `app.module.ts` (no behavior change to the two routes already using it,
    since it is a no-op without the decorator); add `@RateLimit(...)` to
    every other mutating route (`PATCH`/`POST`/`PUT`/`DELETE`) across
    `discovery`, `videos`, `channels`, `topics`, `alerts`, `auth`,
    `markets`, `system` controllers that doesn't already have it, with a
    task-local default limit (see Decisions). Read-only `GET` routes are
    not rate-limited (matches the PRD §16.8 citation already in the
    decorator's own doc comment: "rate-limit export and manual-job-trigger
    endpoints").
  - New `AdminAuditLog` Prisma model + migration
    (`add_admin_audit_log`): `id`, `userId` (FK → `User`), `method`,
    `path`, `statusCode`, `createdAt`. A new global `APP_INTERCEPTOR`
    (`common/audit-log.interceptor.ts`) writes one row after every
    non-`GET` request where `request.user` is set, capturing only
    method+path+status+userId+timestamp — never request/response bodies
    (no secrets, no PII beyond what the path itself names).
  - Extract `quotaBand`/`QUOTA_WARN_PERCENT`/`QUOTA_HIGH_PERCENT`/
    `QUOTA_CRITICAL_PERCENT` out of `system.service.ts` into
    `packages/shared/src/quota-band.ts`; `system.service.ts` imports it
    instead of its own private copy (behavior-identical, confirmed by its
    existing test file continuing to pass unchanged).
- `apps/worker`: new `system-alerts` queue/processor/scheduler, same
  registration pattern as every existing tick (`queues/index.ts` gains one
  more `Queue`, `schedulers/index.ts` gains one more
  `registerSystemAlertsScheduler`, `main.ts` wires one more `Worker` +
  scheduler call):
  - `createSystemAlertsProcessor(deps)`: each tick (15-minute interval,
    same cadence as the other frequent ticks),
    1. reads today's YouTube quota usage/budget (`sumTodayQuotaUsage`/
       `getDailyBudget`, already in `@yvi/db`), computes the band via the
       newly-shared `quotaBand`; if band is `warn`/`high`/`critical`, calls
       `createAlertIfDue` with `alertType: "quota_threshold"`,
       `entityType: "system"`, `entityId: "youtube_quota"`.
    2. for each of the 11 BullMQ queues, calls `queue.getJobCounts()`; if
       `waiting + delayed` exceeds a task-local threshold (see Decisions),
       calls `createAlertIfDue` with `alertType: "job_backlog"`,
       `entityType: "queue"`, `entityId: "<queue name>"`.
  - Cooldown: a shorter task-local constant than Phase 6c's 24h (see
    Decisions) — `SYSTEM_ALERT_COOLDOWN_MS`, local to this processor file.
  - Returns `{ quotaAlertsCreated, backlogAlertsCreated }` for
    observability, same `resultCount`-only convention as Phase 6c.
- Query/index review: `EXPLAIN (ANALYZE, BUFFERS)` the real queries behind
  `GET /videos`, `GET /channels`, `GET /topics`, `GET /alerts` against the
  real dev Postgres; add any index the plan here finds clearly missing
  (documented in Decisions with the actual `EXPLAIN` evidence, not assumed)
  — no blind index-adding.
- New `apps/e2e` package (Vitest, plain `fetch`, no browser automation): one
  suite proving PRD §23.3's flow against a real `apps/api` process + real
  test Postgres + real test Redis: admin login → enable a market → create a
  discovery query → trigger discovery (processed in-process via the real
  `createDiscoverySearchProcessor` with a fake `YouTubeClient` fixture, not
  a live BullMQ worker or real YouTube network call — see Decisions) → view
  the resulting video via `GET /videos/:id` → view its snapshot chart data
  → add it to the watchlist → filter `GET /videos` by market/topic.
- `.github/workflows/ci.yml`: add `postgres:16` and `redis:7` service
  containers to the existing single job; run `prisma migrate deploy`
  against the service Postgres before `pnpm test`; `pnpm test` now also
  runs the new `apps/e2e` suite (picked up automatically as a workspace
  package) using the service containers' connection strings.

Out of scope (user decision, 2026-11-06, each needs an external
account/provider/VPS/elapsed-time this plan cannot supply):

- Real load testing against the list APIs (no tool/target RPS/SLO named by
  the PRD or chosen by the user).
- Sentry account/DSN — error tracking wiring deferred until the user
  provisions an account.
- VPS/staging deployment, reverse proxy config.
- Real database backup mechanism/destination (depends on the undecided
  deploy target).
- "Review YouTube API policies" — a manual/legal reading task, not code.
- The 7-day production-calibration run — requires elapsed calendar time on
  a deployed environment that doesn't exist yet.
- Dependency scanning tooling and backup encryption (PRD §20.4) — both
  depend on the undecided deploy target/provider.

## Approach

1. `packages/shared`: extract `quota-band.ts` out of `system.service.ts`;
   update `system.service.ts` to import it; re-run its existing test file
   unchanged to confirm no behavior change.
2. `apps/api`: global exception filter + `helmet`/CORS in `main.ts` +
   `AdminAuditLog` migration/interceptor + extend `@RateLimit` to remaining
   mutating routes + register `RateLimitGuard` as a global `APP_GUARD`.
   Unit/controller tests for the filter (unhandled error → unified shape),
   the interceptor (mutating request → one audit row; `GET` → none), and
   each newly-rate-limited route (limit-exceeded → 429).
3. `apps/worker`: `system-alerts` queue/processor/scheduler wired the same
   way as every existing tick. Tests: quota band fire/no-fire per band,
   job-backlog fire/no-fire per queue, cooldown dedup for both alert types
   (mirrors Phase 6c's processor test shape).
4. Query/index review against the real dev Postgres: run `EXPLAIN` on the
   four endpoints' real queries, document findings, add any index the
   evidence supports.
5. `apps/e2e`: new package scaffolding (package.json/tsconfig/vitest
   config), the PRD §23.3 flow test, a fake `YouTubeClient` fixture reused
   from (or mirroring) whatever fixture the existing
   `discovery-search.test.ts` already uses for the same purpose.
6. `.github/workflows/ci.yml`: add the two service containers + migrate
   step; run the full suite locally first against a disposable local
   Postgres/Redis to prove the new CI steps actually work before relying on
   GitHub Actions to prove it.
7. Live walkthrough against the real dev stack for the two new alert types
   (same `psql`-cross-checked pattern as every prior phase): force a
   quota-band crossing and a queue backlog, confirm the `Alert` rows via
   `psql`, confirm cooldown dedup, confirm `GET /alerts` surfaces them
   unchanged from Phase 6c's existing page/API (no new code needed there).

## Risks And Recovery

- Risk: registering `RateLimitGuard` as a second global `APP_GUARD`
  alongside `SessionAuthGuard` changes guard *evaluation order* for the two
  routes already using it (NestJS runs global guards before controller-level
  `@UseGuards`). Mitigation: keep `SessionAuthGuard` first in the
  `providers` array (unauthenticated requests still rejected before rate-
  limit bookkeeping runs), confirmed by an explicit order-of-guards test
  before/after the change.
- Risk: the hand-rolled in-memory `RateLimitGuard` resets on process
  restart and does not coordinate across replicas — already an accepted
  risk for the two existing routes (its own doc comment says so); extending
  it to more routes extends the same accepted risk, not a new one. Not
  re-litigated here.
- Risk: the new `system-alerts` tick's `job_backlog` threshold is a
  task-local guess with no production traffic history to calibrate against.
  Mitigation: documented as a task-local default in Decisions, the same
  class of decision as Phase 6c's 24h cooldown — adjustable later with
  real traffic data, not a blocker now.
- Risk: adding Postgres/Redis service containers to CI is the first time
  this repo's automated pipeline depends on live infrastructure state,
  which could make CI flakier (container startup time, port binding) than
  today's fully-isolated unit tests. Mitigation: standard GitHub Actions
  `services:` block with a health-check wait (`--health-cmd pg_isready`),
  the same pattern used across the broader ecosystem; proven locally first
  per Approach step 6 before trusting GitHub Actions to prove it again.
  Recovery: if this proves too flaky in practice, split the E2E job into
  its own workflow/job separate from the fast unit-test job so a flaky E2E
  run doesn't block the fast feedback loop — not implemented now since no
  flakiness has been observed yet.
- Risk: the E2E suite's in-process-processor-call approach (calling
  `createDiscoverySearchProcessor` directly instead of running a real
  BullMQ worker) means the suite does not actually prove BullMQ
  enqueue/dequeue wiring end-to-end, only that the processor function
  itself behaves correctly against real data once invoked. Accepted: BullMQ
  wiring itself is unchanged, generic infrastructure already exercised
  informally by every prior phase's live walkthrough; the goal here is a
  real-YouTube-network-call-free, deterministic, CI-safe proof of the
  PRD §23.3 *data flow*, not a BullMQ integration test. Documented in
  Decisions, not assumed silently.

## Progress

- [x] `packages/shared`: extract `quota-band.ts`.
- [x] `apps/api`: exception filter, CORS/helmet, audit log, extended rate
  limiting.
- [x] `apps/worker`: `system-alerts` tick (quota + job-backlog alerts).
- [x] Query/index review against real dev Postgres.
- [x] `apps/e2e`: PRD §23.3 flow suite.
- [x] `.github/workflows/ci.yml`: Postgres/Redis services + migrate step.
- [x] Live walkthrough against the real dev stack for both new alert types.

## Decisions

- 2026-11-06: Phase 7 scope for this plan is the code-internal subset only
  (E2E tests, quota/job-backlog alerts, query/index review, CORS/rate-limit/
  audit-log from §20.4) — load test, Sentry, VPS/staging, DB backup,
  YouTube policy review, and the 7-day calibration run are explicit
  out-of-scope follow-ups per the user's own choice (2026-11-06), each
  requiring an external account/provider/VPS/elapsed time this plan cannot
  supply.
- 2026-11-06: `quota_threshold`/`job_backlog` alerts are produced by a new
  dedicated `system-alerts` worker tick rather than piggybacked onto an
  existing processor — unlike Phase 6c's three alert types, no existing
  tick already has quota usage or queue depth "in scope" the way
  video/channel/topic state was, so piggybacking would mean bolting an
  unrelated concern onto, e.g., `video-scoring.ts` for no shared-state
  benefit. A new tick costs one more 15-minute Queue/Worker, consistent
  with the cost of every other existing tick in this file.
- 2026-11-06: `SYSTEM_ALERT_COOLDOWN_MS` is shorter than Phase 6c's 24h
  (task-local, chosen during implementation) — quota resets daily and a
  queue backlog can change within hours, so a 24h cooldown would let an
  admin miss a same-day second crossing into a worse band; Phase 6c's
  alerts are long-lived entity-lifecycle states where 24h made sense, these
  are not.
- 2026-11-06: `job_backlog`'s threshold (`waiting + delayed` job count per
  queue) is a task-local constant with no production traffic history to
  calibrate against — same class of decision as Phase 6c's 24h cooldown,
  documented here rather than invented silently and left unstated.
- 2026-11-06: `quotaBand` and its three percent constants are extracted
  from `system.service.ts` into `packages/shared` so `GET /system/quota`
  and the new worker tick cannot drift apart on what counts as "warn" — the
  PRD names the three percentages once; this plan does not introduce a
  second copy of that policy.
- 2026-11-06: `RateLimitGuard` is registered as a second global `APP_GUARD`
  (alongside the existing `SessionAuthGuard`) rather than added via
  `@UseGuards` to every controller individually — the guard is already
  designed as a safe no-op without the `@RateLimit` decorator (confirmed by
  reading its `canActivate`), so registering it globally changes nothing
  for routes that don't opt in, while removing the need to repeat
  `@UseGuards(RateLimitGuard)` and the provider registration on every
  module going forward.
- 2026-11-06: The new `AdminAuditLog` row captures only
  method+path+statusCode+userId+timestamp — no request/response body —
  because PRD §20.4 asks for an audit trail of admin actions, not a
  request-replay log, and logging bodies would risk capturing sensitive
  fields (e.g. a future password-change endpoint's payload) for no stated
  requirement.
- 2026-11-06: The E2E suite (`apps/e2e`) uses Vitest + plain `fetch` against
  a real running `apps/api` process, not Playwright/supertest — no browser
  automation tool exists anywhere in this monorepo today and PRD §23.3's
  flow is API/data-level (view video, view snapshot chart data, filter),
  not a UI-rendering assertion; adding a browser-automation dependency for
  this would be new unrequested tooling weight.
- 2026-11-06: The E2E suite's "trigger discovery" step invokes the real
  `createDiscoverySearchProcessor` function in-process against the real
  test Postgres, with a fake `YouTubeClient` fixture swapped in at the
  dependency-injection boundary — not a live BullMQ `Worker` process and
  not a real YouTube network call. This was a user decision (2026-11-06,
  made when deciding to add Postgres/Redis to CI): running real YouTube API
  calls on every CI push would need a `YOUTUBE_API_KEY` CI secret, consume
  real daily quota non-deterministically on every push, and introduce
  network flakiness — all infra/account concerns the user already scoped
  out of this phase. The in-process-processor approach still exercises the
  real API → DB → processor → DB → API read path genuinely, just without
  the real external network boundary.
- 2026-11-06: CI gains `postgres:16`/`redis:7` service containers and a
  `prisma migrate deploy` step — the first time this repo's automated
  pipeline depends on live service infrastructure, by explicit user
  decision (2026-11-06) after flagging that the existing `pnpm test` CI
  step has never required either.
- (Further implementation-detail decisions — e.g. the exact `job_backlog`
  threshold number, which indexes the `EXPLAIN` review actually adds — will
  be appended here as they are made during implementation, per this repo's
  established Decisions-section discipline.)
- 2026-11-06: Rate-limit defaults chosen for every newly-covered mutating
  route: 30 requests/60s for generic watchlist-toggle/update/mark-read
  mutations (`videos`/`channels` star/unstar, `discovery` create/update
  query, `alerts` markRead, `markets` update) — generous enough for normal
  UI usage but bounds any single-user scripted abuse; `auth.login` gets a
  stricter 5/60s (brute-force protection on an unauthenticated route, keyed
  `"anonymous"` by the guard today since there is no per-user identity yet —
  accepted as a project-wide anonymous-request bucket, consistent with the
  guard's already-accepted single-process/no-per-IP limitation); `auth
  .logout` gets a generous 20/60s (idempotent, never attacker-valuable, but
  still bounded rather than left completely unlimited). `videos.export`
  (5/60s) and `discovery.*.run` (10/60s) were pre-existing defaults, kept
  unchanged.
- 2026-11-06: The two pre-existing `@UseGuards(RateLimitGuard)` call sites
  (`discovery.controller.ts`'s run-query route, `videos.controller.ts`'s
  export route) and their modules' local `RateLimitGuard` provider
  registrations were removed, relying solely on the new global `APP_GUARD`
  — keeping both would register two independent in-memory hit-counters
  checking the same `@RateLimit` metadata for the same route, which is
  functionally harmless but wasteful and confusing; removing the
  module-local registration is exactly the stated benefit of making the
  guard global (see the earlier 2026-11-06 Decision on registering it as a
  second global `APP_GUARD`).
- 2026-11-06: `system`/`topics` controllers have no mutating
  (`PATCH`/`POST`/`PUT`/`DELETE`) routes today (confirmed by reading both
  controller files in full) — no `@RateLimit` was added to either, matching
  the Scope's own "every other mutating route" framing (there is none to
  add it to).
- 2026-11-06 (finalized): `SYSTEM_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000`
  (6 hours) — chosen as a reasoned concrete value for the "shorter than
  Phase 6c's 24h" decision made earlier in this file: quota resets at UTC
  midnight and could cross from warn→high→critical more than once within a
  single day, and a queue backlog can clear and re-form within hours; 6h
  still prevents alert spam between consecutive 15-minute ticks while being
  short enough that an admin sees each new band/backlog crossing the same
  day it happens.
- 2026-11-06 (finalized): `JOB_BACKLOG_THRESHOLD = 50` (`waiting + delayed`
  job count per queue) — chosen as a reasoned concrete value for the
  task-local `job_backlog` threshold decided earlier in this file: every
  existing tick processes its selected rows synchronously within a single
  15-minute window and none has historically queued more than a handful of
  jobs at a time (discovery/enrichment jobs are the only ones that fan out,
  capped by `MAX_VIDEOS_PER_TICK`-style constants elsewhere), so 50 queued
  jobs is already an order of magnitude above normal steady-state and
  signals real backpressure (e.g. YouTube API failures stalling consumption)
  rather than a normal momentary queue depth blip.
- 2026-11-06: `quota_threshold` alert `severity` is set to the `QuotaBand`
  string itself (`"warn"`/`"high"`/`"critical"` — never `"ok"`, since no
  alert fires for that band) rather than inventing a second severity
  vocabulary — `Alert.severity` is a free-text `VarChar(20)` with no PRD-
  specified enum, and the band already expresses exactly the right
  escalation gradient for this alert type. `job_backlog` alerts use a fixed
  `severity: "warning"` (single threshold, no further banding) — distinct
  from Phase 6c's three alert types, which all use `"info"` since they
  report lifecycle-state changes rather than something needing operator
  attention.
- 2026-11-06: The `system-alerts` tick's `job_backlog` check calls
  `queue.getJobCounts("waiting", "delayed")` once per queue (11 queues,
  including its own `system-alerts` queue) sequentially inside the tick,
  not in parallel — same pattern as every other tick's per-item loop in
  this file (e.g. `channel-scoring.ts`'s per-channel loop); 11 small Redis
  calls every 15 minutes is negligible load, not worth the added complexity
  of `Promise.all`.
- 2026-11-06: Query/index review was run with real `EXPLAIN (ANALYZE,
  BUFFERS)` against the real local dev Postgres (not a synthetic/empty DB —
  `videos`=1176, `channels`=916, `topics`=57, `alerts`=5,
  `trend_snapshots`=224, `video_scores`=11, `channel_scores`=600,
  `video_snapshots`=599, `discovery_events`=2867 rows at review time),
  covering the exact raw-SQL queries behind `listVideos`, `listChannels`,
  `listTopics` (`packages/db/src/repositories/{videos,channels,topics}.ts`)
  and the Prisma `findMany` behind `listAlerts`
  (`packages/db/src/repositories/alerts.ts`). Findings:
  - `GET /videos`: every per-row `LATERAL` join (earliest `discovery_events`
    row, latest `video_scores` row, latest `video_snapshots` row) already
    hits an existing index (`discovery_events_video_id_discovered_at_idx`,
    `video_scores_video_id_computed_at_idx`,
    `video_snapshots_video_id_collected_at_key`) — confirmed via `Index
    Scan`/`Index Only Scan` in the plan, both unfiltered and filtered by
    `format_classification = 'short_candidate'` (91% of rows, the worst-case
    selectivity present in the data) and by `monitoring_state`. In both
    cases Postgres chose a cheap `Seq Scan` on `videos`/`channels`
    themselves (140/109 buffer hits for 1176/916 rows) over any index,
    because the table is only a few pages — adding an index on
    `format_classification` or `monitoring_state` would not be used by the
    planner at this scale and is not supported by the evidence. No schema
    change made for `/videos`.
  - `GET /channels`: same pattern — `channel_scores_channel_id_computed_at_idx`
    is used for every per-channel lateral lookup; the base `Seq Scan on
    channels` is cheap at 916 rows. No schema change.
  - `GET /alerts`: the unfiltered case is a trivial `Seq Scan` (5 rows
    total); the `isRead`-filtered case already uses
    `alerts_is_read_triggered_at_idx` (`Index Scan`, 3 buffer hits). No
    schema change — this table is small by nature (one row per fired
    alert, not per entity).
  - `GET /topics`: **real gap found and fixed.** `trend_snapshots` had only
    `@@unique([marketId, topicId, windowStart, windowEnd])` (leading column
    `marketId`) and no index usable by `WHERE topic_id = t.id ORDER BY
    window_end DESC LIMIT 1` — `EXPLAIN` showed a `Seq Scan on
    trend_snapshots` executed once per surviving topic row (`loops=24`,
    `Rows Removed by Filter: 218` per loop, 552 total buffer hits, 2.2ms).
    Added `@@index([topicId, windowEnd(sort: Desc)])` to `TrendSnapshot` in
    `apps/api/prisma/schema.prisma` (migration
    `20261106125118_trend_snapshot_topic_window_index`), matching the exact
    index shape already used for the same per-entity-latest-row pattern on
    `VideoScore`/`ChannelScore`/`VideoSnapshot`. Re-ran the identical
    `EXPLAIN`: the lateral join now uses `Index Scan using
    trend_snapshots_topic_id_window_end_idx`, buffer hits dropped from 552
    to 68, execution time from 2.208ms to 0.646ms. This is the only index
    this review added — every other candidate gap was evidence-checked and
    rejected because the planner would not have used it at current table
    sizes (dataset is real but still small; this finding will need
    re-confirming once `trend_snapshots`/`topics` grow past dev-seed scale,
    but no index should be added ahead of that evidence).
- 2026-11-06: `apps/e2e/src/prd-23-3-flow.test.ts` implements all 10 PRD
  §23.3 bullets as nine Vitest `it` blocks against a real `apps/api`
  process spawned on a dedicated port (3101, via `api-process.ts`'s
  `startApi`, `node -r ts-node/register src/main.ts`, polled on `/auth/me`
  until it stops connection-refusing) and the real dev Postgres/Redis — no
  mocked DB/queue layer, consistent with this plan's "real running
  `apps/api`" decision above. Two PRD steps had no backing
  implementation and are documented here as scope notes rather than
  silently stretched to fit:
  - **"View snapshot chart" / "view channel outlier"**: `VideoSnapshot`
    rows and `Channel.channelTier`/outlier scoring are only populated by
    the `video-monitoring` and `channel-scoring` worker ticks, neither of
    which this suite runs (both require their own real YouTube calls and
    real elapsed polling intervals, out of this phase's scope per the
    "code-internal subset only" decision above). The test instead asserts
    `GET /videos/:id/snapshots` returns `200` with an array (empty, for a
    freshly-discovered video) and `GET /channels/:id` returns `200` with
    the fixture channel's real fields — proving the read path works,
    without fabricating tick output that was never asked for.
  - **"Approve topic candidate"**: no `apps/api` HTTP endpoint exists for
    this — `applyTopicPromotion` (`packages/db/src/repositories/topics.ts`)
    is only ever called by the `topic-normalization` worker tick today.
    Rather than inventing a new endpoint (an unrequested scope expansion)
    or skipping the step, the test calls `applyTopicPromotion` directly —
    the same real repository function production code uses — and asserts
    the resulting `status: "active"`.
  - The "trigger discovery" step chains all three real worker processors
    in-process (`createDiscoverySearchProcessor` ->
    `createVideoEnrichmentProcessor` -> `createChannelEnrichmentProcessor`,
    per the earlier Decision above), using a `createCapturingQueue` stand-in
    (`prd-23-3-flow.test.ts`) that implements just the `{ name, add() }`
    shape `enqueueWithJobRun` reads, instead of a real BullMQ `Queue`/Redis
    round trip for the enrichment fan-out — `apps/api`'s own real queues are
    never touched by this suite.
  - All fixture-created rows (`Video`, `Channel`, `DiscoveryEvent`,
    `VideoTopic`, `Topic`, `DiscoveryQuery`, `JobRun`) are keyed off a
    per-run timestamp marker (`vid-e2e<ts>`, `chan-e2e<ts>`, etc.,
    `youtube-fixture.ts`'s `makeRunMarker`) and deleted in `afterAll`; the
    toggled market's `enabled` flag is restored to whatever it was before
    the test ran (not hardcoded). Verified via direct `psql` queries after
    a real run: zero leftover rows matching the run's marker, and markets'
    `enabled` state unchanged from before the run (dev seed already
    enables all four markets, so this run was a true no-op on that column).
  - `apps/worker` needed `"declaration": true` added to its
    `tsconfig.build.json` (it previously built JS only, like every other
    `apps/*` entry point) so `apps/e2e` can import `ProcessorDeps`/the
    processor factories by type — `apps/worker/src/index.ts` and the
    `main`/`types` `package.json` fields already existed from the earlier
    library-export change; only the missing `.d.ts` emission was new here.
- 2026-11-06: `.github/workflows/ci.yml` rewritten to add `postgres:16` and
  `redis:7` service containers (default ports 5432/6379, health-checked via
  `pg_isready`/`redis-cli ping`), job-level env (`DATABASE_URL`,
  `REDIS_HOST`/`REDIS_PORT`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` for the seed
  step), and two new steps between `typecheck` and `test`: `prisma migrate
  deploy` (via `apps/api`'s existing `prisma:deploy` script) and a seed step
  (`build:deps && node -r ts-node/register prisma/seed.ts`), both run with
  `working-directory: apps/api`.
  - Proved the whole sequence locally before trusting GitHub Actions,
    without touching this project's real dev stack (docker-compose
    `docker-postgres-1`/`docker-redis-1` on 5440/6390) or unrelated
    system-wide `postgres`/`redis-server` processes already bound to the
    OS-default ports 5432/6379: started throwaway, uniquely-named Docker
    containers (`yvi-ci-check-pg`, `yvi-ci-check-redis`, both `--rm`) on
    alternate free ports 5433/6380, then ran the exact CI step sequence
    against them with `DATABASE_URL=postgresql://yvi:yvi@localhost:5433/yvi`,
    `REDIS_HOST=localhost`, `REDIS_PORT=6380`.
  - `pnpm run prisma:deploy` applied all 7 real migrations cleanly to the
    brand-new empty database ("All migrations have been successfully
    applied").
  - The seed step populated the fresh database correctly, confirmed via
    direct `psql` row counts: 1 row in `users`, 4 in `markets`, 6 in
    `topics`.
  - `pnpm test` (root, i.e. `pnpm -r run test`, the same command the
    workflow's final step runs) passed in full against this fresh
    database/Redis pair: 666 tests across all 9 workspace packages with a
    `test` script (web 71, ai-client 37, db 123, shared 37, youtube-client
    41, api 179, scoring 91, worker 78, e2e 9), 0 failures, exit code 0.
  - Threw away both containers afterward (`docker stop`, which also
    removed them since they were started with `--rm`); confirmed via
    `docker ps -a --filter name=yvi-ci-check` returning no rows.
- 2026-11-06: Per user decision, a real GitHub Actions run is not required
  before closing this plan — the project is run locally only, with no
  current GitHub Actions dependency. The `ci.yml` service-container changes
  remain in place (already proven locally, harmless to keep) for whenever
  CI is actually used, but the plan's Validation bar for that item is
  satisfied by the independently re-verified local reproduction instead.
- 2026-11-06: Live walkthrough of both new alert types against the real dev
  stack (docker-compose `docker-postgres-1`/`docker-redis-1`, ports
  5440/6390), run via a temporary, uncommitted script
  (`apps/worker/scratch-live-walkthrough.ts`, deleted after use) that called
  the real `createSystemAlertsProcessor` directly against real `@yvi/db`
  and real BullMQ queues — no mocks.
  - Baseline checked first: 5 pre-existing `Alert` rows, no queue over the
    50-job `JOB_BACKLOG_THRESHOLD`, `youtube_daily_quota_budget` = 10,000
    (an explicit `app_settings` row, not just the code default).
  - Quota-band crossing: temporarily lowered the budget to 1,000 and
    inserted one marker-tagged `ApiUsageLog` row (750 units). Combined with
    real same-day usage already on the books, this put today's usage at
    85% of the (temporary) budget. Tick 1 created one `quota_threshold`
    alert (`severity: "high"`, message "YouTube API quota at 85% of
    today's budget (high)"); an immediate tick 2 created none — confirmed
    `SYSTEM_ALERT_COOLDOWN_MS` (6h) dedup by `(alertType, entityType,
    entityId)` works against a real previously-inserted row, not just in
    a unit test.
  - Job backlog: added 60 one-off jobs (`JOB_BACKLOG_THRESHOLD` is 50) to
    the real `video-enrichment` queue, which was idle (0 waiting/delayed)
    and not being consumed (confirmed no worker process was running).
    Tick 3 created one `job_backlog` alert for that queue; an immediate
    tick 4 created none — same cooldown dedup confirmed for this alert
    type too.
  - Confirmed both alert rows are surfaced unchanged through the real
    `GET /alerts` endpoint: started the real `apps/api` against the real
    dev stack on a scratch port, logged in as the real admin user, and
    fetched `/alerts?limit=10` with the session token — both rows came
    back with the exact fields written by `createAlertIfDue` (`alertType`,
    `entityType`, `entityId`, `message`, `severity`, `isRead`,
    `triggeredAt`).
  - Cleaned up completely afterward: deleted both alert rows, deleted the
    marker-tagged `ApiUsageLog` row, restored `youtube_daily_quota_budget`
    to 10,000, removed all 60 backlog jobs from `video-enrichment`, and
    stopped the scratch `apps/api` process. Verified via direct queries:
    `Alert` count back to 5, `video-enrichment` back to 0 waiting/0
    delayed, budget back to 10,000 — the dev stack was left exactly as
    found.

## Validation

- Focused proof: new/modified unit and controller tests for the exception
  filter, CORS/helmet config, extended rate limiting, the audit-log
  interceptor, the `quota-band` extraction (existing `system.service.test.ts`
  unchanged and still green), and the `system-alerts` processor
  (fire/no-fire/cooldown for both alert types).
- Integration or end-to-end proof: the new `apps/e2e` suite itself (PRD
  §23.3 flow against a real test Postgres/Redis + real `apps/api`), plus a
  live walkthrough against the real dev stack for the two new alert types
  (force a quota-band crossing and a queue backlog, confirm via `psql`,
  confirm cooldown dedup, confirm `GET /alerts` surfaces them).
- Repository-required checks: full `pnpm -r run test`/`typecheck`/`lint`
  across all packages/apps including the new `apps/e2e`; a real GitHub
  Actions run (not just local reproduction) confirming the new CI service
  containers and migrate step actually work, before this plan is marked
  complete.

## Result

Implementation complete and independently re-verified. A separate
verification pass (fresh agent, no reliance on the implementer's own
report) re-read every changed file directly, re-ran `pnpm -r run
lint`/`typecheck`/`test` from scratch (exit 0, 666/666 tests, matching the
implementer's own fresh-container run from a different execution context),
re-ran `apps/e2e` itself (9/9 passed) against the real dev stack, and
queried the real dev Postgres/Redis directly to confirm the live-walkthrough
cleanup left no residue (alert count back to the pre-existing baseline of 5,
quota budget back to 10,000, `video-enrichment` queue back to 0/0, no
leftover scratch files). It also investigated and resolved an anomaly the
implementer flagged (`git status` showing uncommitted work spanning several
earlier phases): confirmed via `git log`/file-mtime cross-check that no
phase since Phase 5 has ever been committed — a pre-existing condition, not
something Phase 7 introduced or something Phase 7's own changes are tangled
into. No discrepancies were found in either implementation.

One explicit gap against this plan's own `## Validation` bar was raised and
has since been resolved by user decision: that section called for "a real
GitHub Actions run (not just local reproduction)" of the new `ci.yml`
service containers before this plan is marked complete, which had not
happened because nothing has been committed or pushed in this repository
since Phase 5. User decision (2026-11-06): this project is run locally only
— no GitHub Actions dependency is needed, so a real Actions run is not
required as evidence. The `ci.yml` changes themselves are kept as written
(harmless, already proven to work via the disposable-container local
reproduction) for whenever the user does start pushing/using CI, but are no
longer a precondition for closing this plan. The independently re-verified
local proof (disposable Docker Postgres/Redis, full `prisma migrate deploy`
+ seed + `pnpm test` against them, 666/666 passing) stands as the
Validation evidence for the CI-related scope item.

Phase 7 is complete with no open items.
