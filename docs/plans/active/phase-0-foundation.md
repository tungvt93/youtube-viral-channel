# Execution Plan: Phase 0 — Foundation

Date: 2026-11-05

## Status

Completed

## Outcome

A developer can bring up the full YVI stack locally with one command
(`docker compose up`), get a healthy response from each service's health
endpoint, and run `lint`/`typecheck`/`test` green — with no business logic
implemented yet. This matches PRD §25 Phase 0 deliverable: "Project chạy
local bằng một lệnh Docker Compose."

## Context

- `prd-youtube-viral-intelligence.md` §14 (stack, architecture, repo
  structure), §15 (full database design), §25 Phase 0 task list.
- [[0001-mvp-scope-decisions]] — personal use (single role), no multi-tenant;
  informs that auth/session only needs to be simple, not a separate
  decision blocker for Phase 0.
- [[0002-no-vendor-outlier-finder]] — not relevant to Phase 0 directly, no
  third-party code is being imported here.
- **Precondition not yet true:** this directory is not a git repository yet
  (confirmed via environment check). Phase 0 must initialize git locally
  before any other step; no remote/GitHub repo will be created or pushed
  without separate confirmation.

## Scope

In scope:

- `git init` + initial `.gitignore` review (one already exists at repo root).
- pnpm workspace monorepo layout matching PRD §14.4:
  `apps/api` (NestJS), `apps/worker` (BullMQ processors/schedulers),
  `apps/web` (Next.js), `packages/shared`, `packages/config`,
  `packages/youtube-client`, `packages/ai-client`, `packages/scoring`
  (last three as empty scaffolds with a package.json + tsconfig only — no
  YouTube/AI/scoring logic yet, that is Phase 1/3/5).
- Shared TypeScript config (`tsconfig.base.json`) and lint/format config
  (ESLint + Prettier) referenced by every app/package.
- Prisma schema translating PRD §15 tables verbatim (markets,
  discovery_queries, videos, channels, discovery_events, video_snapshots,
  channel_snapshots, topics, topic_localizations, video_topics,
  trend_snapshots, video_scores, channel_scores, watchlist_items, alerts,
  job_runs, api_usage_logs, ai_classification_runs, app_settings, users,
  sessions) + first migration against the Dockerized Postgres. Schema only —
  no repositories/services consuming it yet.
- `docker-compose.yml`: `postgres`, `redis`, `api`, `worker`, `web`.
- Pino structured logger wired into `apps/api` and `apps/worker` (fields per
  PRD §22.1, no secrets logged).
- One health endpoint per backend process (`GET /health` in `api`, a
  lightweight liveness check in `worker`), and `apps/web` reachable at `/`.
- Local CI scripts (`pnpm lint`, `pnpm typecheck`, `pnpm test`) runnable
  end-to-end; a CI workflow file is added to the repo but is **not** wired to
  a remote — this repo has no GitHub remote yet.

Out of scope (later phases):

- YouTube API client implementation, discovery/monitoring/scoring/AI logic
  (Phase 1–5).
- Auth/login UI and session enforcement (Phase 6 per PRD roadmap).
- Market/topic seed data (Phase 1).
- Creating or pushing to a GitHub remote, deploying to staging/VPS (Phase 7).

## Approach

1. `git init` locally; first commit will be the empty scaffold baseline once
   it builds and runs (not committed piecemeal mid-broken-state).
2. Scaffold pnpm workspace (`pnpm-workspace.yaml`) and the five empty
   packages + three apps per the structure above, each with a minimal
   `package.json`/`tsconfig.json` that builds.
3. Add shared TS/lint/format config packages first since every app depends
   on them.
4. Write the Prisma schema from PRD §15 in one pass (it is already a fully
   specified, accepted design — no new product decision needed), run the
   first migration against the Dockerized Postgres.
5. Wire Pino into `api`/`worker`, add health endpoints.
6. Write `docker-compose.yml` last, once each piece runs standalone, so
   compose failures are isolated to networking/env wiring rather than app
   bugs.
7. Add lint/typecheck/test scripts at the workspace root and verify them
   green before marking any task done.

## Risks And Recovery

- **Node/pnpm/Next.js/NestJS version drift**: pin exact major versions in
  root `package.json`/`.nvmrc` at scaffold time so later phases don't fight
  version mismatches. Recovery: bump deliberately via a follow-up task, not
  silently.
- **Prisma schema needing changes once Phase 1+ business logic lands**:
  expected and fine — Prisma migrations are additive; this is not treated as
  rework of this plan.
- **Docker Compose networking/env issues** are the most likely local
  failure point. Recovery: bring up `postgres`+`redis` alone first, confirm
  with `pg_isready`/`redis-cli ping`, then add `api`/`worker`/`web` one at a
  time.
- **No git remote exists**: if CI is expected to actually run (not just be
  present as a workflow file), that requires a GitHub remote, which is a
  shared/visible action requiring separate explicit confirmation before
  creating or pushing.

## Progress

- [x] `git init` + verify `.gitignore` covers `node_modules`, `.env`, build
      output.
- [x] pnpm workspace root (`pnpm-workspace.yaml`, root `package.json`,
      `.nvmrc`).
- [x] `packages/config` (shared TS/lint/format config).
- [x] `packages/shared` (shared types/schemas scaffold).
- [x] `packages/youtube-client`, `packages/ai-client`, `packages/scoring`
      (empty scaffolds only).
- [x] `apps/api` NestJS scaffold + Pino + `GET /health`.
- [x] `apps/worker` BullMQ scaffold + Pino + liveness check.
- [x] `apps/web` Next.js scaffold, default page reachable.
- [x] Prisma schema (full PRD §15 tables) + first migration.
- [x] `infra/docker/docker-compose.yml` (postgres, redis, api, worker, web).
- [x] Root `lint`/`typecheck`/`test` scripts green.
- [x] CI workflow file added (not wired to a remote yet).

## Decisions

- 2026-11-05: Monorepo tool = pnpm workspaces only, no Turborepo for MVP
  (PRD §14.4 allows either; Turborepo's caching/orchestration isn't needed
  yet for a personal-use MVP and can be added later without restructuring).
- 2026-11-05: Will not create/push a GitHub remote as part of this plan;
  that is a separate, explicitly-confirmed action.

## Validation

- Focused proof: `pnpm lint`, `pnpm typecheck`, `pnpm test` all exit 0 at
  the workspace root.
- Integration proof: `docker compose up` brings up all five services;
  `curl localhost:<api-port>/health` returns 200; `apps/web` root page
  loads; `psql`/Prisma migration status shows the PRD §15 schema applied.
- Repository-required checks: none configured yet (no CI remote) — this
  plan's "Validation" is local-command proof only until Phase 7 wires real
  CI/CD.

## Result

Verified outcome: the full stack builds and runs with a single
`docker compose -f infra/docker/docker-compose.yml up -d --build`. All 21
PRD §15 tables plus `_prisma_migrations` are present after migration
(confirmed via `\dt` against the compose-managed Postgres — 22 rows). Root
`pnpm lint` / `pnpm typecheck` / `pnpm test` all exit 0 across the 8
lint/typecheck/test-eligible packages (`packages/config` has no such
scripts by design).

Validation evidence (local-command proof, run 2026-11-05):

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` — all exit 0.
- `docker compose up -d --build` — all 5 containers (`postgres`, `redis`,
  `api`, `worker`, `web`) reached `Up`/healthy state.
- `curl -i http://localhost:3001/health` → `200 OK`,
  `{"status":"ok","service":"api","timestamp":"..."}`.
- `curl -i http://localhost:3002/health` (worker) → `200 OK`,
  `{"status":"ok","service":"worker","timestamp":"..."}`.
- `curl -i http://localhost:3000/` (web) → `200 OK`, HTML page rendered.
- `psql -U yvi -d yvi -c '\dt'` inside the compose-managed `postgres`
  container → all 21 PRD §15 tables + `_prisma_migrations` present; api
  container logs confirm `1 migration found in prisma/migrations` /
  `No pending migrations to apply.` on boot.
- `docker compose down` — all containers and the network removed; `docker
  ps` confirms none left running.

Deviations from the plan, with reasons:

- **Host port remap**: `postgres` (5432→5440) and `redis` (6379→6390)
  default host-port mappings in `docker-compose.yml`/`.env.example` were
  changed because ports 5432–5435 were already bound by unrelated
  pre-existing Docker projects on this shared dev machine. Internal
  container-to-container traffic still uses the standard 5432/6379 ports —
  this only affects host-side access.
- **Dockerfiles are dev-grade, not production-slim**: each of
  `Dockerfile.api`/`.worker`/`.web` is a 2-stage build that copies the whole
  monorepo into the runtime stage and runs via `pnpm --filter ... run
  start`, rather than a minimal production image with only compiled
  output + prod deps. Acceptable for Phase 0 (local dev / "one command"
  requirement); revisit for a slimmer image in Phase 7 (deploy).
- **`apk add --no-cache openssl` added to both stages of
  `Dockerfile.api`**: the initial build succeeded but `prisma migrate
  deploy` crashed at container runtime (`Could not parse schema engine
  response`) because `node:20-alpine` doesn't ship the OpenSSL runtime
  Prisma's engine binaries need. Fixed by installing `openssl` via `apk` in
  both the builder and runtime stages.
- **`.npmrc` with `workspace-concurrency=1`** added defensively after
  investigating intermittent `pnpm run lint` flakiness (exit 254,
  "possibly out of memory") that turned out to be corepack's nested-shim
  cache warm-up, not a genuine memory issue — confirmed stable across 5
  consecutive runs. Kept as a low-cost safeguard, not strictly required.
- **`infra/nginx/` left as an empty `.gitkeep` placeholder**: no reverse
  proxy is needed for Phase 0 local dev (each service is reachable
  directly on its own port); nginx wiring is deferred to whichever later
  phase introduces a shared public entrypoint.
- **Prisma pinned at `^5.19.0` (resolved to 5.22.0)** despite a newer
  major (v8 RC) being available, per the "pin exact major versions, avoid
  drift" risk in this plan.

Nothing in this plan's scope could not be verified. Follow-ups for later
phases (not actioned here, out of scope for Phase 0):

- Phase 1+: implement actual `packages/youtube-client`, `packages/ai-client`,
  `packages/scoring` logic (currently placeholder-marker exports only).
- Phase 1+: wire `apps/worker`'s `processors`/`schedulers`/`queues`
  subfolders with real BullMQ queue/processor definitions (currently
  placeholder-marker exports only).
- Phase 6: auth/session enforcement — `users`/`sessions` tables exist in
  the schema but no auth logic/UI exists yet.
- Phase 7: revisit Dockerfiles for production-slim builds, decide on an
  nginx reverse-proxy layer, and create/wire a GitHub remote for CI to
  actually run (the `.github/workflows/ci.yml` file exists but has never
  executed — no remote exists).
