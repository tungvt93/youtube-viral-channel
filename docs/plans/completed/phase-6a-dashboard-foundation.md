# Execution Plan: Phase 6a — Dashboard Foundation (Auth + Core Read Pages)

Date: 2026-11-06

## Status

Completed

## Outcome

An admin can log in through a real email/password session-cookie flow and
use the Next.js dashboard to view live data across Overview, Viral Videos,
Video detail (with snapshot/VPH charts), Channel Discovery, Channel detail,
Topic Trends, and Topic detail — all backed by real Postgres data through
either the already-existing read APIs (`/videos`, `/channels`, `/topics`
and their sub-resources) or new `/overview/*` endpoints. This is a split of
PRD §25 Phase 6 ("Có thể sử dụng sản phẩm qua giao diện web"): the
auth-gated read surface only. Watchlist, Discovery settings, System
health/quota, CSV export, and Alerts are explicitly deferred to a
follow-up Phase 6b plan (see Scope).

## Context

- PRD §11.1 (FR-AUTH-01..04, all P0): email/password login, logout/session
  expiry, API routes require authentication, admin-only config actions.
  `docs/decisions/0001-mvp-scope-decisions.md` item 1 already resolves the
  *role* question (single Admin/User role, no real multi-tenant) — it does
  not waive authentication itself, and the schema already carries real
  `User`/`Session` models (see below), so building real auth here is
  implementing already-specified PRD behavior, not a new open product
  question.
- PRD §13 (UX/UI): §13.1 sidebar nav list (Overview, Viral Videos, Channel
  Discovery, Topic Trends, Watchlist, Alerts, Discovery Sources, Settings,
  System Health — this phase builds pages for the first four only; the
  other five render as present-but-disabled nav items, not missing/broken
  links). §13.2 Overview cards/charts/lists. §13.3 Viral Videos table
  columns/filters. §13.4 Video detail's 10 sections (this phase builds
  1–7; "Related videos" (#8) and "Watchlist/labels" (#10) need designs/APIs
  this phase does not build — see Scope Out). §13.5 Channel detail. §13.6
  Topic detail. §13.7 UX principles (loading/empty/error states, no
  fake-zero for missing data, data-freshness display, score tooltips).
- PRD §16.1/16.3/16.4/16.5 (API Design): `/overview/summary`,
  `/overview/discovery-volume`, `/overview/top-signals` do not exist yet —
  this phase adds them. `/videos`, `/videos/:id/snapshots`,
  `/videos/:id/scores`, `/channels`, `/channels/:id`, `/topics`,
  `/topics/:id/trends` already exist (confirmed by reading
  `apps/api/src/{videos,channels,topics}/*.controller.ts`) and are reused
  as-is — no backend changes to those modules in this phase.
- PRD §20.4 (Application security): password hashing via
  Argon2/bcrypt, secure cookies, CSRF protection when using cookie
  sessions, CORS allowlist, input validation, no secrets in logs.
- Schema already scaffolded and unused since Phase 0 (confirmed by reading
  `apps/api/prisma/schema.prisma`): `User` (`email`, `passwordHash`,
  `role`), `Session` (`sessionToken`, `expiresAt`, FK to `User`). No
  migration needed to create these tables. Confirmed via `psql`: both
  tables exist and are currently empty (0 rows) — no real user has ever
  been created.
- No `auth` module, no CORS config, no cookie-parsing middleware, and no
  password-hashing dependency exist anywhere in `apps/api` yet (confirmed
  via grep across `apps/api/src` and `apps/api/package.json`). No seed
  step creates a user (confirmed by reading `apps/api/prisma/seed.ts`,
  which currently only seeds markets/topics/discovery queries).
- `apps/web` is still the Phase 0 scaffold: `app/layout.tsx` and
  `app/page.tsx` only, no routing structure, no styling setup beyond
  Next.js defaults, no chart library, no API-calling code at all
  (confirmed by reading both files and `apps/web/package.json`).
- Existing DTO conventions to reuse as-is (confirmed by reading
  `apps/api/src/channels/channels.service.ts` and
  `apps/api/src/topics/topics.service.ts`): plain `@Injectable()` service,
  no DTO classes/class-validator, a local `countToString`/`toNumberOrNull`
  pair per module for `bigint`/`Decimal` → JSON-safe values, manual
  `NotFoundException`.

## Scope

In scope:

- `packages/db`: repository functions for `User` (`findUserByEmail`) and
  `Session` (`createSession`, `getActiveSessionByToken` — joins `User` and
  excludes expired rows, `deleteSession`); new read-only aggregate queries
  backing Overview (counts/top-N lists per PRD §13.2, reusing the same
  tables/fields Phase 1–5 already populate — no new columns).
- `apps/api`:
  - `auth` module: `POST /auth/login` (email+password → session), `POST
    /auth/logout`, `GET /auth/me`. Argon2 for password verification
    (§20.4). A `SessionAuthGuard` applied to every controller except
    `health` and `auth` itself, reading the session token from a custom
    request header (see Decisions on the BFF design — no cookie ever
    reaches `apps/api` directly).
  - `overview` module: `GET /overview/summary`, `GET
    /overview/discovery-volume`, `GET /overview/top-signals` (§16.1),
    read-only, same DTO conventions as `channels`/`topics`.
  - `prisma/seed.ts` extended with an idempotent admin-user upsert from
    `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars (skipped with a warning, not a
    default password, if either is absent — see Risks).
  - Argon2 dependency.
- `apps/web`:
  - App Router pages: `/login`, `/` (Overview), `/videos` (table +
    §13.3 filters as URL search params), `/videos/[id]` (detail: sections
    1–7 of §13.4), `/channels` (table), `/channels/[id]` (detail, §13.5),
    `/topics` (trends list), `/topics/[id]` (detail, §13.6).
  - Route Handlers under `app/api/auth/*` implementing the BFF session
    proxy (login/logout/me — see Decisions).
  - A shared layout with the §13.1 sidebar; nav items with no page yet in
    this phase render disabled, not broken.
  - `recharts` dependency for the snapshot/VPH/trend line charts.
  - CSS Modules for styling (no UI framework/dependency).
- `.env.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD` (seed-only, empty
  placeholders), `API_INTERNAL_URL` (server-only, e.g.
  `http://localhost:3001`, never exposed to the browser bundle).

Out of scope (explicit, not silent — PRD §25 Phase 6 tasks not covered
here go to a Phase 6b plan):

- Watchlist (API + UI), Discovery settings CRUD UI (incl. `PATCH
  /markets/:id` enable/disable, FR-MKT-02), System health/quota page,
  CSV export, Alerts page/API. All deferred to Phase 6b.
- Video detail's "Related videos" (#8) and "Watchlist/labels" (#10)
  sections — the former has no defined similarity query yet, the latter
  needs the Phase 6b watchlist API. Sections 1–7 and 9 (channel summary)
  ship in this phase.
- Multi-user signup, password reset, RBAC beyond the single admin role —
  explicitly out per `0001-mvp-scope-decisions.md` item 1.
- Rate limiting, admin audit log (§20.4) — Phase 7 hardening.
- Mobile-specific polish beyond basic responsive layout (§13.7
  "responsive tablet/mobile" is best-effort, not a goal this phase proves).

## Approach

1. `packages/db`: add the user/session repository functions and the
   Overview aggregate queries. Unit test the aggregate queries' SQL
   shape against the existing test DB fixtures used by `channels`/`topics`
   repository tests.
2. `apps/api`: add Argon2 dependency; build `auth` module
   (login/logout/me) and `SessionAuthGuard`; wire the guard onto
   `app.module.ts` globally with `health`/`auth` excluded; extend
   `prisma/seed.ts` with the admin-user upsert; build `overview` module.
3. `apps/web`: scaffold the app-wide layout + sidebar nav + CSS Modules
   base styles; build the BFF auth Route Handlers and a small
   server-side `fetchApi(path, { sessionToken })` helper used by every
   Server Component; build `/login`.
4. `apps/web`: Overview page (cards/charts/lists per §13.2).
5. `apps/web`: Viral Videos table + filters (§13.3) as a Server Component
   reading `searchParams`.
6. `apps/web`: Video detail page + snapshot and VPH/growth charts
   (`recharts`), sections 1–7 and 9.
7. `apps/web`: Channel Discovery table + Channel detail (§13.5).
8. `apps/web`: Topic Trends list + Topic detail (§13.6).
9. Full validation: `pnpm -r run typecheck/lint/test`; then a real,
   personally-run browser-equivalent walkthrough (cookie-jar `curl` or an
   actual browser) — create the admin user via seed, log in, confirm a
   session cookie is set, load every page built in steps 3–8 and confirm
   it renders real data (not mocked), confirm a request with no/garbage
   session is rejected by the guard, confirm logout clears the session
   and subsequent page loads redirect to `/login`.
10. Record the architecture decisions actually made (BFF design, Argon2,
    recharts, CSS Modules, session TTL) in Decisions below, with dates
    and reasons, before moving this plan to `docs/plans/completed/`.

## Risks And Recovery

- **CSRF, addressed by architecture rather than a CSRF-token mechanism.**
  PRD §20.4 names "CSRF protection when using cookie sessions" as a
  requirement. This plan's BFF design (browser only ever talks to
  `apps/web`, same-origin; `apps/web`'s Node server is the only thing that
  ever calls `apps/api`, carrying the session token as a custom header,
  never as a cookie `apps/api` would accept cross-origin) removes the
  cross-site credentialed-request surface CSRF protection exists to
  close: there is no cookie that any other origin could get the browser
  to send to `apps/api`, and the only cookie that exists (on the `apps/web`
  origin) is `httpOnly` so no script can read it, and is sent only on
  requests to `apps/web` itself. This is a real design choice, not an
  omission — flagged explicitly for confirmation before implementation
  starts, since it changes how a literal PRD line is satisfied.
- Password/session handling is genuinely security-sensitive: must use
  Argon2 (not a toy comparison), a cryptographically random ≥256-bit
  session token, `httpOnly` + `Secure` (in production) + `SameSite=Lax`
  cookie on the `apps/web` origin only, and must never log a password or
  session token value (same discipline as this session's `.env` secret
  handling).
- `API_INTERNAL_URL` must stay server-only — verify it never ends up in
  the browser bundle (Next.js only inlines `NEXT_PUBLIC_*`-prefixed vars
  into client code, so a plain, non-prefixed env var is safe by
  convention, but this must be checked, not assumed).
- Admin seed must fail safe: if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are absent,
  skip with a warning rather than create an account with a blank or
  predictable password.
- First real browser-facing UI in this project — PRD §13.7 explicitly
  requires loading/empty/partial-data/error states and "no fake zero for
  missing data"; must be checked by actually loading pages, not inferred
  from passing unit tests.
- `recharts` is a new production frontend dependency — justified by 3+
  PRD-required charts (§13.2, §13.4, §13.6); not introducing a UI
  component framework beyond that.
- Session TTL is a first-cut, task-local constant (not from the PRD) —
  flagged the same way `RECENCY_TAU_HOURS`-style constants were flagged in
  earlier phases; revisit once real usage patterns exist.

## Progress

- [x] `packages/db`: user/session repository functions + Overview
      aggregate queries, with unit tests.
- [x] `apps/api`: Argon2 dep, `auth` module, `SessionAuthGuard`, seed-admin
      extension, `overview` module, with unit tests.
- [x] `apps/web`: layout/nav/CSS Modules base, BFF auth Route Handlers,
      `fetchApi` helper, `/login`.
- [x] `apps/web`: Overview page.
- [x] `apps/web`: Viral Videos table + filters. Unblocked by team-lead
      authorizing the `GET /videos` endpoint addition — see Decisions
      2026-11-06.
- [x] `apps/web`: Video detail + snapshot/VPH charts. Same authorization.
- [x] `apps/web`: Channel Discovery table + Channel detail.
- [x] `apps/web`: Topic Trends + Topic detail.
- [x] Full validation: typecheck/lint/test (repo-wide, all 8 packages) +
      a real curl-based login → cookie → every page (Overview, Channels,
      Channel detail, Topics, Topic detail, Viral Videos, Video detail) →
      guard-rejection → logout walkthrough against the live local stack.
      Exact commands/output in Result below.
- [x] Decisions and Result sections filled in with real evidence. Plan is
      intentionally **kept in `active/`**, not moved to `completed/`, per
      standing instruction — team-lead/user retains the move decision.

## Decisions

- **2026-11-06 — `/videos` list/detail endpoint gap, resolved by team-lead
  authorization.** This plan's Context section claims `/videos` "already
  exists" and is reused as-is. Re-reading
  `apps/api/src/videos/videos.controller.ts` during implementation showed
  it only had `GET /videos/:id/snapshots` and `GET /videos/:id/scores` —
  no `GET /videos` (list) or `GET /videos/:id` (detail) route, and
  `VideosService` had no corresponding methods. I flagged this to
  team-lead rather than unilaterally expanding scope; team-lead explicitly
  authorized adding both endpoints as a bounded correction to the plan's
  factual premise. Built: `packages/db` `listVideos`/`getVideoDetail`
  repo functions (raw `$queryRawUnsafe` with `LEFT JOIN LATERAL` for
  latest-snapshot/latest-score-per-video, filters for `marketId`,
  `format`, `lifecycle`, `topicId` (`EXISTS` against `video_topics`),
  `channelTier`, `minViews`, `minScore`), `apps/api` `GET /videos` + `GET
  /videos/:id` controller/service with full unit tests, and the
  corresponding `apps/web` `/videos` list + `/videos/:id` detail pages.
  VPH/Growth%/outlier-multiplier are deliberately **not** exposed as list
  filters/sort keys or list-table columns: they live only inside
  `VideoScore.scoreBreakdown` JSON, not as plain queryable columns, so
  adding them as SQL filters would require a schema/query change beyond
  this correction's scope. The video detail page computes them client-side
  from snapshot history instead (inlined, matching
  `packages/scoring/src/metrics.ts`'s `computeVph`/`computeGrowthPct`
  formulas exactly, since `apps/web` has no dependency on `@yvi/scoring`).
- **2026-11-06 — Session TTL.** Set to 7 days as a first-cut, task-local
  constant (no PRD value specified), consistent with the Risks section's
  own framing — flagged, not hidden, for revisit once real usage patterns
  exist.
- **2026-11-06 — Argon2, not bcrypt.** Chosen per PRD §20.4's "Argon2/bcrypt"
  either-or; Argon2 is the modern recommended default and the repo had no
  existing bcrypt usage to match.
- **2026-11-06 — CSRF via BFF architecture, not a token mechanism.**
  Implemented exactly as scoped in Risks: `apps/web`'s Route Handlers are
  the only caller of `apps/api`, carrying `X-Session-Token` as a header
  (never a cookie `apps/api` would accept cross-origin); the only real
  cookie is `httpOnly`, `SameSite=Lax`, set on the `apps/web` origin only.
  Verified end-to-end in the walkthrough below.
- **2026-11-06 — Overview scope narrowing.** `UnavailableCard` ("API quota
  status") is shown instead of fabricated data, since quota tracking is
  explicitly out of scope (deferred to Phase 6b per the plan's Outcome).
  Only the two charts backed by real aggregate queries
  (`discovery-volume` by day/by market) were built; no chart was invented
  without a backing query.
- **2026-11-06 — Channel detail page scope narrowing.** Ships only the
  fields the existing `GET /channels/:id` (and whatever sub-resource
  endpoints already exist) actually return; PRD §13.5 bullets not backed
  by a real field/endpoint were omitted rather than faked.
- **2026-11-06 — Topic detail page scope narrowing.** There is no `GET
  /topics/:id` endpoint — only `GET /topics/:id/trends`. The detail page
  therefore shows only trend-snapshot-derived data (momentum, unique
  video/channel counts, outliers, lifecycle state, score breakdown) and
  deliberately omits `canonicalName`/`description`/`confidence`/seed
  queries/related topics from PRD §13.6, since no endpoint backs them and
  adding one would be the same kind of unauthorized backend scope
  expansion as the `/videos` gap above. Team-lead explicitly reviewed and
  agreed with this scope-narrowing decision.
- **2026-11-06 — Bug found and fixed: `prisma/seed.ts` type error never
  caught by `pnpm run typecheck`.** `apps/api/tsconfig.json`'s `"include":
  ["src"]` means `prisma/seed.ts` is never actually typechecked by the
  repo's own `typecheck` script (`ts-node`'s direct single-file invocation
  checks against `tsconfig.json`'s compiler options but ignores its
  `include` glob). This let a real `TS2345` error ship silently: the
  `seedAdminUser` function's `env` parameter was typed as
  `Pick<NodeJS.ProcessEnv, "ADMIN_EMAIL" | "ADMIN_PASSWORD">`, but
  `NodeJS.ProcessEnv` in current `@types/node` has no literal declared
  properties (only an index signature), so `process.env` is not
  structurally assignable to that `Pick`. Fixed by widening the parameter
  type to a plain `{ ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string }`,
  which process.env IS assignable to. Left the `tsconfig.json` `include`
  scope itself unchanged — widening it to cover `prisma/` is a reasonable
  follow-up but is a repo-wide typecheck-script change beyond this
  phase's scope; flagging it here rather than fixing it unilaterally.
- **2026-11-06 — Environment note (not a code bug): Argon2 segfaults under
  Node v21.7.3.** The active system Node (v21.7.3, an EOL non-LTS release)
  segfaults (SIGSEGV, exit 139) on `require('argon2')`/`argon2.hash()`
  even with a correct platform prebuild present. Node v24.15.0 (available
  via `nvm`) runs Argon2 correctly. The repo's `engines` field only
  requires `>=20.0.0`, so this could silently bite any other contributor
  running `apps/api` (or the seed script) under a non-LTS Node — the
  failure mode is a bare segfault with no error message pointing at the
  Node version. No code change made; documenting here since it is a real
  operational risk worth the team knowing about, with Node v24 LTS as the
  recommended workaround/floor.
- **2026-11-06 — Bug found and fixed: CSS Modules bare-element selectors.**
  `overview.module.css`, `channels.module.css`, and `topics.module.css`
  each had a bare `h1 { ... }` rule, which Next.js's css-loader rejects
  ("Selector is not pure") — this produced an HTTP 500 on `/`, `/channels`,
  and `/topics` respectively. Fixed by renaming each to a `.heading` class
  and applying `className={styles.heading}` on the corresponding `<h1>`.
  Verified by grepping all `*.module.css` files for other bare top-level
  element selectors (none found) and by reloading all three routes
  successfully after the fix.

- **2026-11-06 — Environment note (not a code bug): `apps/api` has no
  `.env` loading of its own.** `apps/api/src/main.ts` never calls
  `dotenv.config()` or a Nest `ConfigModule` — it relies entirely on
  `process.env` already being populated by the shell that launches it.
  Starting it with a bare `pnpm run start:dev` (no env sourced) left
  `DATABASE_URL` unset: `GET /health` returned 200 (no DB touch) but
  `POST /auth/login` 500'd with `PrismaClientInitializationError:
  Environment variable not found: DATABASE_URL`. Not a credentials/seed
  problem — I separately verified the stored admin argon2 hash matches
  the current `.env` `ADMIN_PASSWORD` via a direct `argon2.verify` call
  before finding this. Fixed operationally by sourcing `.env` into the
  shell (`set -a; source .env; set +a`) before `pnpm run start:dev`; no
  code change, since `start:dev` has no `pre` hook unlike `build`/
  `typecheck`/`test` and adding `.env` auto-loading is a cross-cutting
  config change beyond this phase's scope. Documenting here so the next
  person starting `apps/api` manually doesn't lose time to the same
  silent-until-DB-touched failure.

## Validation

- Focused proof: unit tests for the new repository functions, the
  session guard's accept/reject logic, and the Overview aggregate
  queries' shape.
- Integration/end-to-end proof: a real login → cookie → every new page →
  guard-rejects-invalid-session → logout walkthrough, run personally
  against the real local stack (not just the subagent's self-report).
- Repository-required checks: `pnpm -r run typecheck`, `pnpm -r run lint`,
  `pnpm -r run test`, re-run independently after implementation.

## Result

All in-scope Phase 6a items (auth + Overview + Channels + Topics + the
`/videos`-endpoint-correction-authorized Viral Videos/Video detail pages)
are implemented and verified against the real local stack on 2026-11-06.

**Repo-wide checks (re-run after all implementation, all 8 workspace
packages — `packages/shared`, `packages/db`, `packages/youtube-client`,
`packages/scoring`, `apps/api`, `apps/web`, `apps/worker`, and one more):**

- `pnpm -r run typecheck` → exit 0, clean across all 8 packages.
- `pnpm -r run lint` → exit 0, clean across all 8 packages.
- `pnpm -r run test` → exit 0. Aggregated across all 8 packages: 467 tests
  passed, 2 skipped (by design — `packages/db`'s
  `videos.integration.test.ts`, which requires a live DB connection and
  is explicitly `describe.skip`'d for the unit-test run), 0 failed.

**Live curl walkthrough (real local stack: `docker-postgres-1` on :5440,
`docker-redis-1` on :6390, `apps/api` on :3001, `apps/web` on :3000,
Node v24.15.0 for Argon2 compatibility):**

1. Seed: confirmed `admin@yvi.local` present in `users` via direct
   `psql` query (argon2 hash, 97 chars) before the walkthrough.
2. Login via the BFF (`POST http://localhost:3000/api/auth/login` with
   `{"email":"admin@yvi.local","password":"<ADMIN_PASSWORD from .env>"}`)
   → `200 OK`, body `{"user":{"id":"ba3a520e-...","email":"admin@yvi.local","role":"admin"}}`,
   response header
   `set-cookie: yvi_session=<token>; Path=/; Expires=...; HttpOnly; SameSite=lax`
   — confirms the first-party cookie is httpOnly + SameSite=Lax and the
   raw `sessionToken` from apps/api's response body is never forwarded to
   the browser as JSON (only as this cookie), per the BFF requirement.
3. Every authenticated page fetched with that cookie, all `200 OK` with
   real rendered data confirmed in the response body (not just status
   code): `/` (Overview), `/channels` (Channel Discovery), `/channels/:id`
   (real channel detail incl. subscriber count), `/topics` (Topic Trends),
   `/topics/:id` (Momentum/Trend data), `/videos` (Viral Videos table,
   "Viral Videos" heading + row data), `/videos/:id` (full detail: title,
   thumbnail, Views/Likes/Comments/Viral-score cards, snapshot chart,
   discovery-history table with 4 real rows, channel-summary panel linking
   to `/channels/:id`).
4. Guard rejection: `GET /` and `GET /videos` with no cookie, and with a
   garbage `yvi_session` cookie value, both returned Next.js's streamed
   redirect (`NEXT_REDIRECT;replace;/login;307;` digest +
   `<meta http-equiv="refresh" content="1;url=/login"/>` fallback) — no
   real dashboard data rendered. Direct `apps/api` check with an invalid
   `X-Session-Token` header on `GET /auth/me` → `401 Unauthorized`,
   `{"message":"Invalid or expired session","error":"Unauthorized","statusCode":401}`.
5. Logout: `POST http://localhost:3000/api/auth/logout` with the valid
   cookie → `200 OK`, `{"ok":true}`, response header
   `set-cookie: yvi_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=lax`.
   Re-using the now-expired cookie against `/` → redirected to `/login`
   again (`NEXT_REDIRECT;replace;/login;307;`). Re-using the same raw
   session token directly against `apps/api`'s `GET /auth/me` →
   `401 Unauthorized` — confirms server-side session invalidation, not
   just a client-side cookie clear.

One real bug was found and fixed during this walkthrough (not a code
bug — see Decisions 2026-11-06, "`apps/api` has no `.env` loading of its
own"): starting `apps/api` without sourcing `.env` into its shell left
`DATABASE_URL` unset, causing `/health` to pass (no DB touch) while
`/auth/login` 500'd. Fixed by sourcing `.env` before `start:dev`; no code
change needed.

Both dev servers (`apps/api` :3001, `apps/web` :3000) were stopped after
this walkthrough completed.

Unresolved risks / deferred: `UnavailableCard` placeholders for
out-of-scope PRD fields (API quota status; Topic detail's
canonicalName/description/confidence/seed-queries/related-topics;
Video detail's related-videos/watchlist sections) remain as documented
gaps for Phase 6b, not silently-faked data. The `apps/api` `.env`-loading
gap above is an operational note for future contributors starting the
service manually, not a Phase 6a defect.
