# On-Demand Keyword Search & Recommended Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on discovery schedulers (regional viral-chart poll, periodic admin keyword search, 6-hour recommended-sidebar scrape tick) with a single on-demand action: the user submits one keyword on a new `/search` screen, a background job searches for it, enriches the results into `Video` rows, walks the YouTube recommended-sidebar for those same results, and the dashboard shows the outcome (including a seen/unseen marker) without the user needing to keep the tab open.

**Architecture:** One new BullMQ queue/processor (`keyword-search`) owns the whole pipeline per submitted keyword, calling two extracted library functions — `enrichVideoIds` (lifted out of the existing `video-enrichment` processor) and `scrapeRecommendedForSeeds` (lifted out of the existing `recommended-scrape` processor) — in-process rather than via queue fan-out, so one job produces one final status. A new `KeywordSearch` table is the source of truth for that status/history, mirroring how `JobRun` already backs job observability. `apps/api` gets a new `keyword-searches` module (same shape as the `alerts`/`discovery` modules it replaces); `apps/web` gets a new `/search` screen (same shape as the `/discovery` screen it replaces) plus a sidebar badge for unseen completed searches. Worker bootstrap stops registering the three retired schedulers but keeps their processor code in the tree, unreachable, per decision 0005.

**Tech Stack:** NestJS (`apps/api`), BullMQ + ioredis (`apps/worker`), Next.js App Router Server Components/Actions (`apps/web`), Prisma/PostgreSQL (`packages/db`), Vitest across all three apps.

**Spec:** `docs/superpowers/specs/2026-11-12-on-demand-keyword-discovery-design.md` (depends on `docs/decisions/0005-on-demand-keyword-search-discovery.md` and `docs/decisions/0004-recommended-videos-scraping-exception.md`).

## Global Constraints

- Single page of search results per keyword search: up to 50 results (`maxResults: 50`, no further pagination) — design doc "What's left", decided default.
- All of a run's enriched results feed the recommended-scrape step, capped at the existing per-run cap constant (renamed `MAX_SEEDS_PER_RUN`, value unchanged at `20`) — design doc "What's left", decided default.
- `DiscoveryEvent.source` for the keyword-search enrichment step is the new literal `"keyword_search"`; the recommended-sidebar step keeps writing `"recommended_scrape"` — design doc Decided §4.
- The keyword-search job shares the existing daily YouTube API quota guard (`checkQuotaGuard`/`QUOTA_COST`) with every other processor — no reserved pool — design doc Decided §3.
- A quota-guard block at any API-calling step ends the run `status = "failed"` with an `errorMessage` naming the quota block, never a silently empty `"completed"` — design doc Decided §3, user decision (quota-exhaustion AskUserQuestion answer).
- On a mid-run failure after some videos/recommended-videos were already written, persist the counts actually completed so far; already-written `Video`/`DiscoveryEvent`/enrichment-queue rows are never rolled back — design doc Decided §5.
- Gentle-scraping behavior (sequential fetch, randomized 3-5s delay, circuit breaker past 50% per-run failure, degradation-average warning) is reused unchanged from `recommended-scrape.ts` — design doc Constraints.
- No proxy rotation / evasion — decision 0004, carried forward unchanged.
- `apps/worker/src/schedulers/index.ts`'s blast radius is exactly three call sites removed from `apps/worker/src/main.ts` (`registerDiscoverySchedulers`, `registerRecommendedScrapeScheduler`); every other scheduler registration in `main.ts` is untouched — design doc Anti-goals.
- `discoveryRegional`/`discoverySearch` queues, processors, and the `DiscoveryQuery` table stay in the tree, unused but not deleted — decision 0005 Decision §1/§3.
- `apps/api/src/discovery/*` (controller/service/module) and `apps/web/app/(dashboard)/discovery/*` are deleted outright, replaced by the new `keyword-searches` module and `/search` screen — decision 0005 Decision §3, design doc Decided (Web).

## Review Focus

- **Empty search results.** A keyword with zero `search.list` hits must still end `status = "completed"` with `videosFound = 0`, `recommendedVideosFound = 0` — not `"failed"` and not stuck `"running"` (design doc Anti-goals: no outcome may be invisible). Pinned to Task 4's tests.
- **Quota guard blocks mid-run, after some videos were already enriched.** The run must end `"failed"` with the quota-block `errorMessage` and `videosFound` reflecting whatever was actually upserted before the block, not `0` and not `null` (design doc Decided §3/§5). Pinned to Task 4's tests.
- **A keyword search submitted with a disabled or unknown market.** `POST /keyword-searches` must reject it (`400`/`404`) before creating a row or enqueueing a job, the same way `DiscoveryService`/`AlertsService` reject unknown ids — nothing in the design doc says this explicitly, but it is the existing convention every sibling module follows. Pinned to Task 5's tests.
- **Acknowledging a search that is still `queued`/`running`.** `POST /keyword-searches/:id/ack` must be a no-op (or reject) rather than letting a user hide a search's unseen status before it has actually finished, since the badge's whole point is surfacing *completed* work. Pinned to Task 5's tests.
- **The recommended-scrape step finding zero sidebar recommendations for every result** (e.g. YouTube markup degradation). `recommendedVideosFound` must land as `0`, and the run must still end `"completed"` (a thin sidebar is not an error) — mirrors the existing degradation-warning path in `recommended-scrape.ts`, which never fails the tick outright. Pinned to Task 3's tests.

---

## File Structure

- `apps/api/prisma/schema.prisma` — add `KeywordSearch` model.
- `apps/api/prisma/migrations/<timestamp>_add_keyword_search/migration.sql` — generated migration.
- `apps/worker/src/processors/lib/enrich-videos.ts` — new: `enrichVideoIds`, extracted from `video-enrichment.ts`, used by both the queue processor and the new keyword-search processor.
- `apps/worker/src/processors/lib/enrich-videos.test.ts` — new.
- `apps/worker/src/processors/video-enrichment.ts` — modified: thin wrapper calling `enrichVideoIds`.
- `apps/worker/src/processors/video-enrichment.test.ts` — modified to match.
- `apps/worker/src/processors/lib/scrape-recommended.ts` — new: `scrapeRecommendedForSeeds`, extracted from `recommended-scrape.ts`.
- `apps/worker/src/processors/lib/scrape-recommended.test.ts` — new.
- `apps/worker/src/processors/recommended-scrape.ts` — modified: thin wrapper calling `scrapeRecommendedForSeeds`.
- `apps/worker/src/processors/recommended-scrape.test.ts` — modified to match.
- `apps/worker/src/processors/keyword-search.ts` — new: the on-demand pipeline processor.
- `apps/worker/src/processors/keyword-search.test.ts` — new.
- `apps/worker/src/processors/index.ts` — modified: export `createKeywordSearchProcessor`.
- `apps/worker/src/queues/index.ts` — modified: add `keywordSearch: Queue`.
- `apps/worker/src/schedulers/index.ts` — modified: rename `MAX_SEEDS_PER_TICK` usage is internal to the extracted lib, no scheduler change needed here beyond what `main.ts` calls.
- `apps/worker/src/main.ts` — modified: stop calling `registerDiscoverySchedulers`/`registerRecommendedScrapeScheduler`; add a `Worker` for `keywordSearch`.
- `packages/shared/src/queues.ts` — modified: add `QUEUE_NAMES.keywordSearch`, `KeywordSearchJobData`.
- `packages/shared/src/index.ts` — modified: export `KeywordSearchJobData`.
- `packages/db/src/repositories/keyword-searches.ts` — new: `KeywordSearch` CRUD.
- `packages/db/src/repositories/keyword-searches.test.ts` — new.
- `packages/db/src/index.ts` — modified: export the new repository functions/types.
- `apps/api/src/keyword-searches/keyword-searches.module.ts` — new.
- `apps/api/src/keyword-searches/keyword-searches.controller.ts` — new.
- `apps/api/src/keyword-searches/keyword-searches.service.ts` — new.
- `apps/api/src/keyword-searches/keyword-searches.service.test.ts` — new.
- `apps/api/src/keyword-searches/keyword-searches.controller.test.ts` — new.
- `apps/api/src/app.module.ts` — modified: swap `DiscoveryModule` for `KeywordSearchesModule`.
- `apps/api/src/discovery/` — deleted (`discovery.controller.ts`, `discovery.service.ts`, `discovery.module.ts`, and their `.test.ts` files).
- `apps/web/app/(dashboard)/search/page.tsx` — new.
- `apps/web/app/(dashboard)/search/page.test.ts` — new.
- `apps/web/app/(dashboard)/search/actions.ts` — new.
- `apps/web/app/(dashboard)/search/actions.test.ts` — new.
- `apps/web/app/(dashboard)/search/search.module.css` — new.
- `apps/web/app/(dashboard)/discovery/` — deleted (`page.tsx`, `actions.ts`, `discovery.module.css`, and their `.test.ts` files).
- `apps/web/components/sidebar.tsx` — modified: rename nav entry, add unseen-count badge.
- `apps/web/components/sidebar.test.tsx` — new (sidebar currently has no test file).

---

### Task 1: `KeywordSearch` schema + repository

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `pnpm --filter @yvi/api prisma:migrate` (generates `apps/api/prisma/migrations/<timestamp>_add_keyword_search/`)
- Create: `packages/db/src/repositories/keyword-searches.ts`
- Create: `packages/db/src/repositories/keyword-searches.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export interface KeywordSearchWithMarket extends KeywordSearch { market: Market }

  export function createKeywordSearch(
    db: PrismaClient,
    input: { query: string; marketId: string; language: string },
  ): Promise<KeywordSearchWithMarket>;

  export function getKeywordSearchById(db: PrismaClient, id: string): Promise<KeywordSearchWithMarket | null>;

  export function listKeywordSearchesWithMarket(
    db: PrismaClient,
    filter: { unseenOnly?: boolean },
    limit: number,
  ): Promise<KeywordSearchWithMarket[]>;

  export function markKeywordSearchRunning(db: PrismaClient, id: string, startedAt: Date): Promise<KeywordSearch>;

  export interface FinishKeywordSearchInput {
    id: string;
    status: "completed" | "failed";
    videosFound: number;
    recommendedVideosFound: number;
    errorMessage: string | null;
    finishedAt: Date;
  }
  export function finishKeywordSearch(db: PrismaClient, input: FinishKeywordSearchInput): Promise<KeywordSearch>;

  export function ackKeywordSearch(db: PrismaClient, id: string, now: Date): Promise<KeywordSearch>;
  ```

- [ ] **Step 1: Add the `KeywordSearch` model to `apps/api/prisma/schema.prisma`**

Insert after the `DiscoveryQuery` model (same section style, `PRD §6.3/§16.6 amendment` comment banner):

```prisma
model KeywordSearch {
  id                      String    @id @default(uuid())
  query                   String
  marketId                String    @map("market_id")
  language                String    @db.VarChar(10)
  status                  String    @default("queued") @db.VarChar(20)
  jobRunId                String?   @map("job_run_id")
  videosFound             Int?      @map("videos_found")
  recommendedVideosFound  Int?      @map("recommended_videos_found")
  errorMessage            String?   @map("error_message")
  createdAt               DateTime  @default(now()) @map("created_at")
  finishedAt              DateTime? @map("finished_at")
  acknowledgedAt          DateTime? @map("acknowledged_at")

  market                  Market    @relation(fields: [marketId], references: [id])

  @@index([createdAt(sort: Desc)])
  @@index([status, acknowledgedAt])
  @@map("keyword_searches")
}
```

Add `keywordSearches KeywordSearch[]` to the `Market` model's relations block, next to `discoveryQueries`.

- [ ] **Step 2: Generate and review the migration**

Run: `pnpm --filter @yvi/api prisma:migrate -- --name add_keyword_search`
Expected: a new `apps/api/prisma/migrations/<timestamp>_add_keyword_search/migration.sql` creating `keyword_searches` and its two indexes, applied to the local dev database with no errors.

- [ ] **Step 3: Write failing repository tests in `packages/db/src/repositories/keyword-searches.test.ts`**

Mirror the mocking style of an existing simple repo test (e.g. `packages/db/src/repositories/discovery-events.test.ts` if present, else the `db.<model>.*` call shape used throughout `videos.ts`/`markets.ts`). Use a fake `db` object with `vi.fn()` Prisma-call stand-ins (`db.keywordSearch.create`, `.findUnique`, `.findMany`, `.update`). Cases:

```ts
it("createKeywordSearch creates a row with status queued and includes market", async () => { ... });
it("listKeywordSearchesWithMarket orders by createdAt desc and applies the limit", async () => { ... });
it("listKeywordSearchesWithMarket with unseenOnly filters to completed/failed rows with acknowledgedAt null", async () => { ... });
it("markKeywordSearchRunning sets status to running", async () => { ... });
it("finishKeywordSearch writes status, counts, errorMessage, and finishedAt", async () => { ... });
it("ackKeywordSearch sets acknowledgedAt when null", async () => { ... });
it("ackKeywordSearch is idempotent: a second call does not overwrite the original acknowledgedAt", async () => { ... });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @yvi/db test -- keyword-searches`
Expected: FAIL with "Cannot find module './keyword-searches'" (or similar — the file doesn't exist yet).

- [ ] **Step 5: Implement `packages/db/src/repositories/keyword-searches.ts`**

Follow `discovery-queries.ts`'s shape exactly (plain exported functions over `db.keywordSearch.*`, no classes). `createKeywordSearch` calls `db.keywordSearch.create({ data: input, include: { market: true } })`. `listKeywordSearchesWithMarket` with `unseenOnly: true` adds `where: { status: { in: ["completed", "failed"] }, acknowledgedAt: null }`; without it, no `where` filter, `orderBy: { createdAt: "desc" }`, `take: limit`, `include: { market: true }`. `markKeywordSearchRunning` does `db.keywordSearch.update({ where: { id }, data: { status: "running" } })` (the `startedAt` param is accepted for interface symmetry with `startJobRun` but unused — `KeywordSearch` has no separate `startedAt` column, `createdAt` already covers it; drop the unused parameter instead of taking dead input). `finishKeywordSearch` writes all of `status`/`videosFound`/`recommendedVideosFound`/`errorMessage`/`finishedAt`. `ackKeywordSearch` reads the row first; if `acknowledgedAt` is already set, returns it unchanged (mirrors `markAlertRead`'s idempotency); otherwise updates `acknowledgedAt = now`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @yvi/db test -- keyword-searches`
Expected: PASS, all cases above green.

- [ ] **Step 7: Export from `packages/db/src/index.ts`**

Add, alongside the existing `discovery-queries` export block:

```ts
export {
  ackKeywordSearch,
  createKeywordSearch,
  finishKeywordSearch,
  getKeywordSearchById,
  listKeywordSearchesWithMarket,
  markKeywordSearchRunning,
} from "./repositories/keyword-searches";
export type { FinishKeywordSearchInput, KeywordSearchWithMarket } from "./repositories/keyword-searches";
export type { KeywordSearch } from "../generated/client";
```

- [ ] **Step 8: Run the full `@yvi/db` test suite**

Run: `pnpm --filter @yvi/db test`
Expected: PASS, no regressions in other repository tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/db/src/repositories/keyword-searches.ts packages/db/src/repositories/keyword-searches.test.ts packages/db/src/index.ts
git commit -m "feat(db): add KeywordSearch model and repository"
```

---

### Task 2: Extract `enrichVideoIds` from the video-enrichment processor

**Files:**
- Create: `apps/worker/src/processors/lib/enrich-videos.ts`
- Create: `apps/worker/src/processors/lib/enrich-videos.test.ts`
- Modify: `apps/worker/src/processors/video-enrichment.ts`
- Modify: `apps/worker/src/processors/video-enrichment.test.ts`

**Interfaces:**
- Consumes: `ProcessorDeps` (`apps/worker/src/processors/deps.ts`); `checkQuotaGuard` (`apps/worker/src/processors/quota.ts`); `enqueueWithJobRun` (`apps/worker/src/job-helpers.ts`); `classifyFormat`, `QUOTA_COST`, `YouTubeApiError` (`@yvi/youtube-client`); `ensureChannelStub`, `upsertVideo`, `createDiscoveryEvent`, `recordApiUsage` (`@yvi/db`).
- Produces (used by Task 2's own wrapper and Task 4's keyword-search processor):
  ```ts
  export class QuotaGuardBlockedError extends Error {
    constructor(public readonly projectedUsage: number) { super(`quota guard: projected usage ${projectedUsage} exceeds daily budget`); }
  }

  export interface EnrichVideoIdsParams {
    ids: string[]; // up to 50
    rankByVideoId: Map<string, number | null>;
    marketId: string | null;
    discoveryQueryId: string | null;
    source: string;
    discoveredAt: Date;
    sourcePayload?: Record<string, unknown> | null;
    jobRunId: string; // used as the enqueueWithJobRun suffix for channel-enrichment fan-out
  }

  export interface EnrichedVideo { id: string; youtubeVideoId: string }

  /** Mutated incrementally (one push per video actually upserted) so a caller still has partial progress if this throws partway through. */
  export interface EnrichVideoIdsProgress {
    savedVideos: EnrichedVideo[];
    discoveredChannelIds: Set<string>;
  }

  export async function enrichVideoIds(
    deps: ProcessorDeps,
    params: EnrichVideoIdsParams,
    progress: EnrichVideoIdsProgress,
    now: () => Date,
  ): Promise<void>; // throws QuotaGuardBlockedError or the underlying YouTubeApiError/DB error; progress reflects whatever completed before the throw
  ```

- [ ] **Step 1: Write failing tests in `apps/worker/src/processors/lib/enrich-videos.test.ts`**

Copy the mocking setup from the current `apps/worker/src/processors/video-enrichment.test.ts` (`vi.hoisted` + `vi.mock("@yvi/db", ...)`, `vi.mock("@yvi/youtube-client", ...)` for `classifyFormat`/`QUOTA_COST`/`YouTubeApiError`, a fake `deps.youtube.listVideosByIds`, a fake `deps.queues.videoEnrichment` queue, a fake `deps.db`). Cases:

```ts
it("throws QuotaGuardBlockedError and writes nothing when the guard blocks", async () => { ... });
it("upserts a video, writes a DiscoveryEvent with the given source, and records the channel id per result", async () => { ... });
it("pushes each saved video into progress.savedVideos before moving to the next one", async () => { ... });
it("enqueues channel-enrichment once for all discovered channel ids, keyed off jobRunId", async () => { ... });
it("records api usage as an error and rethrows when listVideosByIds throws", async () => { ... });
it("leaves progress.savedVideos with only the videos committed before a mid-loop upsertVideo failure", async () => {
  // upsertVideo mock: resolves once, then rejects — asserts progress.savedVideos.length === 1 after the rejection
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/worker test -- enrich-videos`
Expected: FAIL with "Cannot find module './enrich-videos'".

- [ ] **Step 3: Implement `enrichVideoIds` in `apps/worker/src/processors/lib/enrich-videos.ts`**

Move the body of today's `processVideoEnrichment` (quota guard → `listVideosByIds` → per-item `classifyFormat`/`ensureChannelStub`/`upsertVideo`/`createDiscoveryEvent` → `enqueueWithJobRun` channel fan-out) into this function, with two changes: (1) the quota guard throws `QuotaGuardBlockedError` instead of returning a sentinel; (2) each successful `upsertVideo` immediately does `progress.savedVideos.push({ id: savedVideo.id, youtubeVideoId: video.videoId })` and each resolved `video.channelId` does `progress.discoveredChannelIds.add(video.channelId)`, both before moving to the next item in the loop, so a later throw still leaves `progress` reflecting real DB state. The channel-enrichment fan-out at the end uses `Array.from(progress.discoveredChannelIds)` and `${params.jobRunId}:channels` as the `enqueueWithJobRun` id. No `finishJobRun`/`startJobRun` here — that stays the caller's responsibility (Task 2 Step 5, and Task 4).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker test -- enrich-videos`
Expected: PASS.

- [ ] **Step 5: Rewrite `apps/worker/src/processors/video-enrichment.ts` as a thin wrapper**

`processVideoEnrichment` now: builds `progress = { savedVideos: [], discoveredChannelIds: new Set() }`, calls `enrichVideoIds(deps, { ids, rankByVideoId, marketId: job.data.marketId, discoveryQueryId: job.data.discoveryQueryId, source: job.data.source, discoveredAt: new Date(job.data.discoveredAt), sourcePayload: job.data.sourcePayload, jobRunId: job.data.jobRunId }, progress, now)`. On success, `finishJobRun` completed with `resultCount: progress.savedVideos.length`, returns `{ enriched: progress.savedVideos.length }`. On `QuotaGuardBlockedError`, `finishJobRun` failed with that error's `message`, returns `{ enriched: 0 }` (no rethrow — matches today's quota-block behavior). On any other thrown error, log it the same way as today (`YouTubeApiError` code extraction unchanged), `finishJobRun` failed with the formatted message, rethrow.

- [ ] **Step 6: Update `apps/worker/src/processors/video-enrichment.test.ts`**

Keep the existing test cases (they test `createVideoEnrichmentProcessor`'s observable behavior, not its internals) but repoint the `@yvi/db`/`@yvi/youtube-client` mocks so they still work through `enrichVideoIds`'s unchanged call shape (same function names, same arguments) — no assertions should need to change, since the wrapper preserves the processor's external contract exactly (same `finishJobRun` calls, same return shape). Add one new case: `it("reports the quota-guard message as errorMessage without rethrowing", ...)` if not already covered.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker test -- video-enrichment`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/processors/lib/enrich-videos.ts apps/worker/src/processors/lib/enrich-videos.test.ts apps/worker/src/processors/video-enrichment.ts apps/worker/src/processors/video-enrichment.test.ts
git commit -m "refactor(worker): extract enrichVideoIds for reuse by keyword-search"
```

---

### Task 3: Extract `scrapeRecommendedForSeeds` from the recommended-scrape processor

**Files:**
- Create: `apps/worker/src/processors/lib/scrape-recommended.ts`
- Create: `apps/worker/src/processors/lib/scrape-recommended.test.ts`
- Modify: `apps/worker/src/processors/recommended-scrape.ts`
- Modify: `apps/worker/src/processors/recommended-scrape.test.ts`

**Interfaces:**
- Consumes: `ProcessorDeps`; `enqueueWithJobRun`; `fetchWatchPageHtml`, `WatchPageFetchError` (`apps/worker/src/scrape/fetch-watch-page.ts`); `parseRecommendedVideos` (`apps/worker/src/scrape/parse-recommended.ts`); `getVideoIdsByYoutubeIds`, `getMarketByCode`, `createDiscoveryEvent`, `markVideoRecommendedScraped` (`@yvi/db`); `RecommendedScrapeSeed` shape (`videoId`, `youtubeVideoId`, `gl`, `hl`, `rootSeedVideoId`) — same shape `@yvi/db`'s `RecommendedScrapeSeed` already exports, reused verbatim by Task 4's own seed-construction.
- Produces (used by Task 3's own wrapper and Task 4's keyword-search processor):
  ```ts
  export const MAX_SEEDS_PER_RUN = 20; // renamed from MAX_SEEDS_PER_TICK, same value

  export interface ScrapeRecommendedResult {
    seedsProcessed: number;
    newVideosEnqueued: number;
    knownVideosLinked: number;
    seedsFailed: number;
  }

  export async function scrapeRecommendedForSeeds(
    deps: ProcessorDeps,
    seeds: RecommendedScrapeSeed[],
    jobRunId: string,
  ): Promise<ScrapeRecommendedResult>;
  ```

- [ ] **Step 1: Write failing tests in `apps/worker/src/processors/lib/scrape-recommended.test.ts`**

Copy the mocking setup from today's `apps/worker/src/processors/recommended-scrape.test.ts` (fake `fetchWatchPageHtml`/`parseRecommendedVideos`, fake `deps.db`, fake `deps.queues.videoEnrichment`, `vi.useFakeTimers()` or injected `sleep` to avoid real delays — check how the existing test avoids the 3-5s real delay and mirror it exactly). Cases (ported from the existing processor test, retargeted at the new function):

```ts
it("returns all-zero counts for an empty seeds array without any db/network calls", async () => { ... });
it("enqueues video-enrichment for new recommended ids and links known ones via DiscoveryEvent", async () => { ... });
it("marks a seed scraped even when its fetch fails, and counts it as failed", async () => { ... });
it("trips the circuit breaker and stops early once failures exceed half the seeds", async () => { ... });
it("logs a degradation warning once the rolling average drops below threshold", async () => { ... });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/worker test -- scrape-recommended`
Expected: FAIL with "Cannot find module './scrape-recommended'".

- [ ] **Step 3: Implement `scrapeRecommendedForSeeds` in `apps/worker/src/processors/lib/scrape-recommended.ts`**

Move the per-seed loop body of today's `processRecommendedScrape` (the `for (let index = 0; index < seeds.length; index += 1)` block, the module-level `recentRecommendedCounts` degradation-tracking array, `sleep`/`randomDelayMs`, `DELAY_MIN_MS`/`DELAY_MAX_MS`/`DEGRADATION_WINDOW_SIZE`/`DEGRADATION_WARN_THRESHOLD`) into this file unchanged in behavior. Rename `MAX_SEEDS_PER_TICK` to `MAX_SEEDS_PER_RUN` here (it's now a per-call cap on `seeds.length`, enforced by whoever builds the `seeds` array — this function itself does not re-slice, since Task 4 passes an already-capped list and the existing processor already passes an already-capped list from `listRecommendedScrapeSeeds(deps.db, MAX_SEEDS_PER_RUN, now())`). No `startJobRun`/`finishJobRun` here.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker test -- scrape-recommended`
Expected: PASS.

- [ ] **Step 5: Rewrite `apps/worker/src/processors/recommended-scrape.ts` as a thin wrapper**

`processRecommendedScrape` now: `startJobRun`, `listRecommendedScrapeSeeds(deps.db, MAX_SEEDS_PER_RUN, now())` (import the renamed constant from `./lib/scrape-recommended`), early-return `finishJobRun` completed with `resultCount: 0` if no seeds, otherwise `scrapeRecommendedForSeeds(deps, seeds, jobRun.id)`, then `finishJobRun` completed with `resultCount: result.newVideosEnqueued`, return the same `{ seedsProcessed, newVideosEnqueued, knownVideosLinked, seedsFailed }` shape as today.

- [ ] **Step 6: Update `apps/worker/src/processors/recommended-scrape.test.ts`**

Keep existing cases (they assert `createRecommendedScrapeProcessor`'s external behavior, which is unchanged), update only the `MAX_SEEDS_PER_TICK` → `MAX_SEEDS_PER_RUN` identifier if the test file references it directly.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker test -- recommended-scrape`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/processors/lib/scrape-recommended.ts apps/worker/src/processors/lib/scrape-recommended.test.ts apps/worker/src/processors/recommended-scrape.ts apps/worker/src/processors/recommended-scrape.test.ts
git commit -m "refactor(worker): extract scrapeRecommendedForSeeds for reuse by keyword-search"
```

---

### Task 4: `keyword-search` queue, job data, and processor

**Files:**
- Modify: `packages/shared/src/queues.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/worker/src/queues/index.ts`
- Create: `apps/worker/src/processors/keyword-search.ts`
- Create: `apps/worker/src/processors/keyword-search.test.ts`
- Modify: `apps/worker/src/processors/index.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `enrichVideoIds`, `QuotaGuardBlockedError` (Task 2); `scrapeRecommendedForSeeds`, `MAX_SEEDS_PER_RUN` (Task 3); `markKeywordSearchRunning`, `finishKeywordSearch`, `getMarketById` (`@yvi/db` — `getMarketById` already exported from `./repositories/markets`); `checkQuotaGuard`; `finishJobRun`; `QUOTA_COST`, `YouTubeApiError` (`@yvi/youtube-client`).
- Produces (used by Task 5's API service):
  ```ts
  // packages/shared/src/queues.ts
  export const QUEUE_NAMES = { /* ...existing..., */ keywordSearch: "keyword-search" } as const;

  export interface KeywordSearchJobData {
    jobRunId: string;
    keywordSearchId: string;
    query: string;
    marketId: string;
    language: string;
  }

  // apps/worker/src/processors/keyword-search.ts
  export function createKeywordSearchProcessor(deps: ProcessorDeps): (job: Job<KeywordSearchJobData>) => Promise<{ videosFound: number; recommendedVideosFound: number }>;
  ```

- [ ] **Step 1: Add `keywordSearch` to `QUEUE_NAMES` and define `KeywordSearchJobData` in `packages/shared/src/queues.ts`**

Add the `keywordSearch: "keyword-search"` entry to the `QUEUE_NAMES` object (keep alphabetical-by-insertion matching the existing list's style — append at the end, after `systemAlerts`). Add the `KeywordSearchJobData` interface shown above, with a one-line doc comment: "Unlike discovery-regional/search, the API pre-creates both the `KeywordSearch` row and its paired `JobRun` before enqueueing — this processor only ever calls `finishJobRun`, never `startJobRun` (same pattern as `VideoEnrichmentJobData`)."

- [ ] **Step 2: Run the shared package's existing tests to verify nothing broke**

Run: `pnpm --filter @yvi/shared test`
Expected: PASS (this step only adds new exports, no behavior change).

- [ ] **Step 3: Export `KeywordSearchJobData` from `packages/shared/src/index.ts`**

Add `KeywordSearchJobData` to the existing `export type { ... } from "./queues"` block.

- [ ] **Step 4: Add the `keywordSearch` queue to `apps/worker/src/queues/index.ts`**

Add `keywordSearch: Queue;` to the `Queues` interface and `keywordSearch: new Queue(QUEUE_NAMES.keywordSearch, { connection }),` to `createQueues`.

- [ ] **Step 5: Write failing tests in `apps/worker/src/processors/keyword-search.test.ts`**

Mock `@yvi/db` (`markKeywordSearchRunning`, `finishKeywordSearch`, `getMarketById`, `finishJobRun`), mock `./lib/enrich-videos` (`enrichVideoIds`, `QuotaGuardBlockedError`), mock `./lib/scrape-recommended` (`scrapeRecommendedForSeeds`), mock `./quota` (`checkQuotaGuard`), and provide a fake `deps.youtube.search`. Cases:

```ts
it("marks the search running, then completed with videosFound/recommendedVideosFound counts on a normal run", async () => { ... });
it("ends completed with videosFound=0 and recommendedVideosFound=0 when search.list returns no items", async () => {
  // deps.youtube.search resolves { items: [] }; enrichVideoIds/scrapeRecommendedForSeeds must not be called
});
it("ends failed with the quota-guard message, and does not call youtube.search, when the search-step guard blocks", async () => { ... });
it("ends failed with the quota-guard message, and persists the videosFound count completed so far, when enrichVideoIds throws QuotaGuardBlockedError partway through", async () => {
  // simulate enrichVideoIds mutating progress.savedVideos to length 1 before throwing
});
it("ends completed with a 0 recommendedVideosFound but videosFound>0 when scrapeRecommendedForSeeds finds nothing", async () => { ... });
it("writes DiscoveryEvent source \"keyword_search\" via enrichVideoIds's params, not \"search\"", async () => {
  // assert the params object passed to enrichVideoIds has source: "keyword_search" and discoveryQueryId: null
});
it("caps the seeds passed to scrapeRecommendedForSeeds at MAX_SEEDS_PER_RUN", async () => { ... });
it("rethrows and marks failed on an unexpected error from youtube.search", async () => { ... });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @yvi/worker test -- keyword-search`
Expected: FAIL with "Cannot find module './keyword-search'".

- [ ] **Step 7: Implement `apps/worker/src/processors/keyword-search.ts`**

```ts
export function createKeywordSearchProcessor(deps: ProcessorDeps) {
  return async function processKeywordSearch(job: Job<KeywordSearchJobData>) {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.keywordSearch });

    await markKeywordSearchRunning(deps.db, job.data.keywordSearchId);
    const market = await getMarketById(deps.db, job.data.marketId);

    const progress: EnrichVideoIdsProgress = { savedVideos: [], discoveredChannelIds: new Set() };
    let recommendedVideosFound = 0;

    try {
      const searchGuard = await checkQuotaGuard(deps.db, QUOTA_COST.search_list, startedAt);
      if (!searchGuard.allowed) {
        throw new QuotaGuardBlockedError(searchGuard.projectedUsage);
      }

      let result;
      try {
        result = await deps.youtube.search({
          q: job.data.query,
          regionCode: market?.code,
          relevanceLanguage: job.data.language,
          order: "date",
          videoDuration: "short",
          maxResults: 50,
        });
        await recordApiUsage(deps.db, { endpoint: "search.list", quotaEstimate: QUOTA_COST.search_list, status: "success", marketId: job.data.marketId, requestTime: now() });
      } catch (error) {
        await recordApiUsage(deps.db, { endpoint: "search.list", quotaEstimate: QUOTA_COST.search_list, status: "error", marketId: job.data.marketId, requestTime: now() });
        throw error;
      }

      if (result.items.length > 0) {
        const rankByVideoId = new Map(result.items.map((item, index) => [item.videoId, index]));
        await enrichVideoIds(
          deps,
          {
            ids: result.items.map((item) => item.videoId),
            rankByVideoId,
            marketId: job.data.marketId,
            discoveryQueryId: null,
            source: "keyword_search",
            discoveredAt: now(),
            jobRunId: job.data.jobRunId,
          },
          progress,
          now,
        );

        const seeds: RecommendedScrapeSeed[] = progress.savedVideos
          .slice(0, MAX_SEEDS_PER_RUN)
          .map((v) => ({ videoId: v.id, youtubeVideoId: v.youtubeVideoId, gl: market!.code, hl: job.data.language, rootSeedVideoId: v.youtubeVideoId }));
        const scrapeResult = await scrapeRecommendedForSeeds(deps, seeds, job.data.jobRunId);
        recommendedVideosFound = scrapeResult.newVideosEnqueued + scrapeResult.knownVideosLinked;
      }

      await finishKeywordSearch(deps.db, {
        id: job.data.keywordSearchId,
        status: "completed",
        videosFound: progress.savedVideos.length,
        recommendedVideosFound,
        errorMessage: null,
        finishedAt: now(),
      });
      await finishJobRun(deps.db, { id: job.data.jobRunId, status: "completed", finishedAt: now(), durationMs: now().getTime() - startedAt.getTime(), resultCount: progress.savedVideos.length, errorMessage: null });
      return { videosFound: progress.savedVideos.length, recommendedVideosFound };
    } catch (error) {
      const message = error instanceof QuotaGuardBlockedError
        ? error.message
        : error instanceof YouTubeApiError ? `${error.code}: ${error.message}` : String(error);
      log.error({ status: "error" }, message);
      await finishKeywordSearch(deps.db, {
        id: job.data.keywordSearchId,
        status: "failed",
        videosFound: progress.savedVideos.length,
        recommendedVideosFound,
        errorMessage: message,
        finishedAt: now(),
      });
      await finishJobRun(deps.db, { id: job.data.jobRunId, status: "failed", finishedAt: now(), durationMs: now().getTime() - startedAt.getTime(), resultCount: null, errorMessage: message });
      if (error instanceof QuotaGuardBlockedError) {
        return { videosFound: progress.savedVideos.length, recommendedVideosFound };
      }
      throw error;
    }
  };
}
```

One line on the approach choice left open by the signature: whether a `QuotaGuardBlockedError` rethrows mirrors `video-enrichment.ts`'s and `discovery-search.ts`'s existing convention of swallowing (not rethrowing) a quota-guard block while rethrowing every other error, so BullMQ's own retry/failed-job bookkeeping only fires for genuine errors, not expected budget exhaustion.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker test -- keyword-search`
Expected: PASS.

- [ ] **Step 9: Export `createKeywordSearchProcessor` from `apps/worker/src/processors/index.ts`**

Add `export { createKeywordSearchProcessor } from "./keyword-search";` next to the other processor exports.

- [ ] **Step 10: Update `apps/worker/src/main.ts`**

Remove the calls to `registerDiscoverySchedulers(prisma, queues)` and `registerRecommendedScrapeScheduler(queues)` (and their now-unused imports from `./schedulers/index`) — every other `register*Scheduler` call stays untouched. Add `new Worker(QUEUE_NAMES.keywordSearch, createKeywordSearchProcessor(deps), { connection })` to the `workers` array, and `createKeywordSearchProcessor` to the import from `./processors/index`. Update the `logger.info` startup-queue-list string to include `keyword-search` and drop nothing from it (the `discoveryRegional`/`discoverySearch`/`recommendedScrape` workers themselves stay registered — only their *schedulers* are removed — so the log line is unchanged except for the addition).

- [ ] **Step 11: Run the full worker test suite**

Run: `pnpm --filter @yvi/worker test`
Expected: PASS, no regressions in `schedulers`, `main`, or any other processor test.

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/queues.ts packages/shared/src/index.ts apps/worker/src/queues/index.ts apps/worker/src/processors/keyword-search.ts apps/worker/src/processors/keyword-search.test.ts apps/worker/src/processors/index.ts apps/worker/src/main.ts
git commit -m "feat(worker): add on-demand keyword-search queue and processor"
```

---

### Task 5: `apps/api` — `keyword-searches` module, delete `discovery` module

**Files:**
- Create: `apps/api/src/keyword-searches/keyword-searches.module.ts`
- Create: `apps/api/src/keyword-searches/keyword-searches.controller.ts`
- Create: `apps/api/src/keyword-searches/keyword-searches.service.ts`
- Create: `apps/api/src/keyword-searches/keyword-searches.service.test.ts`
- Create: `apps/api/src/keyword-searches/keyword-searches.controller.test.ts`
- Modify: `apps/api/src/app.module.ts`
- Delete: `apps/api/src/discovery/discovery.controller.ts`, `apps/api/src/discovery/discovery.controller.test.ts`, `apps/api/src/discovery/discovery.service.ts`, `apps/api/src/discovery/discovery.service.test.ts`, `apps/api/src/discovery/discovery.module.ts`

**Interfaces:**
- Consumes: `createKeywordSearch`, `getKeywordSearchById`, `listKeywordSearchesWithMarket`, `ackKeywordSearch`, `getMarketById`, `startJobRun`, `prisma` (`@yvi/db`); `QUEUE_NAMES`, `KeywordSearchJobData` (`@yvi/shared`); `RateLimit` decorator (`../common/rate-limit.decorator`); `createRedisConnection` (`../redis`) — same DI pattern as `DiscoveryService`.
- Produces (used by Task 6's web actions, as the exact JSON DTO shape web code is written against):
  ```ts
  export interface KeywordSearchDto {
    id: string;
    query: string;
    marketId: string;
    marketCode: string;
    language: string;
    status: "queued" | "running" | "completed" | "failed";
    videosFound: number | null;
    recommendedVideosFound: number | null;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
    acknowledgedAt: string | null;
  }
  export interface CreateKeywordSearchBody { query?: string; marketId?: string; language?: string }
  ```
  Routes: `POST /keyword-searches`, `GET /keyword-searches` (`?unseen=true` filter), `GET /keyword-searches/:id`, `POST /keyword-searches/:id/ack`.

- [ ] **Step 1: Write failing tests in `apps/api/src/keyword-searches/keyword-searches.service.test.ts`**

Mirror `discovery.service.test.ts`'s mocking style (`vi.hoisted` + `vi.mock("@yvi/db", ...)`, a fake BullMQ `Queue` injected via an `@Optional() deps` constructor param). Cases:

```ts
it("create rejects with BadRequestException when query/marketId/language is missing", async () => { ... });
it("create rejects with NotFoundException when the market does not exist", async () => { ... });
it("create rejects with BadRequestException when the market is disabled", async () => { ... });
it("create creates the KeywordSearch row, starts a JobRun, and enqueues the job with matching ids", async () => { ... });
it("list returns DTOs ordered as the repository returns them", async () => { ... });
it("list passes unseen=true through to listKeywordSearchesWithMarket's unseenOnly filter", async () => { ... });
it("getById throws NotFoundException for an unknown id", async () => { ... });
it("ack rejects with BadRequestException when the search is still queued or running", async () => { ... });
it("ack calls ackKeywordSearch and returns the updated DTO when the search is completed or failed", async () => { ... });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/api test -- keyword-searches.service`
Expected: FAIL with "Cannot find module './keyword-searches.service'".

- [ ] **Step 3: Implement `apps/api/src/keyword-searches/keyword-searches.service.ts`**

Follow `DiscoveryService`'s shape: `@Injectable() export class KeywordSearchesService implements OnModuleDestroy`, constructor takes `@Optional() deps: { connection?: IORedis; keywordSearch?: Queue } = {}`, builds its own `Queue(QUEUE_NAMES.keywordSearch, { connection })` if not injected, closes both in `onModuleDestroy`. `create(body)`: validate required fields (`BadRequestException`), `getMarketById` (`NotFoundException` if missing, `BadRequestException` if `!market.enabled`), `createKeywordSearch(prisma, { query, marketId, language })`, `startJobRun(prisma, { jobName: QUEUE_NAMES.keywordSearch, queue: QUEUE_NAMES.keywordSearch, startedAt: new Date() })` (no pre-assigned `id` — unlike `DiscoveryService.triggerRun`'s idempotency key, there's no natural dedup key for a free-text keyword search, so let `startJobRun` generate a uuid), `this.keywordSearch.add(QUEUE_NAMES.keywordSearch, { jobRunId: jobRun.id, keywordSearchId: row.id, query, marketId, language }, { jobId: jobRun.id })`, return `toDto(row)`. `list(query: { unseen?: string; limit?: string })`: parse/clamp `limit` the same way `AlertsService.parseListQuery` does (default/max mirrored from that file), call `listKeywordSearchesWithMarket(prisma, { unseenOnly: query.unseen === "true" }, limit)`, map to DTOs. `getById(id)`: `getKeywordSearchById`, `NotFoundException` if null, else DTO. `ack(id)`: `getKeywordSearchById`, `NotFoundException` if null, `BadRequestException` if `status` is `"queued"` or `"running"`, else `ackKeywordSearch(prisma, id, new Date())` and return its DTO.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @yvi/api test -- keyword-searches.service`
Expected: PASS.

- [ ] **Step 5: Write failing tests in `apps/api/src/keyword-searches/keyword-searches.controller.test.ts`**

Mirror `AlertsController`'s direct-call test style (construct the controller with a fake service object, assert each route method delegates to the right service method with the right args) — same shape the repo already uses for its thinnest controllers.

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @yvi/api test -- keyword-searches.controller`
Expected: FAIL with "Cannot find module './keyword-searches.controller'".

- [ ] **Step 7: Implement `apps/api/src/keyword-searches/keyword-searches.controller.ts`**

```ts
@Controller("keyword-searches")
export class KeywordSearchesController {
  constructor(private readonly keywordSearchesService: KeywordSearchesService) {}

  @Post()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  create(@Body() body: CreateKeywordSearchBody) { return this.keywordSearchesService.create(body); }

  @Get()
  list(@Query("unseen") unseen?: string, @Query("limit") limit?: string) { return this.keywordSearchesService.list({ unseen, limit }); }

  @Get(":id")
  getById(@Param("id") id: string) { return this.keywordSearchesService.getById(id); }

  @Post(":id/ack")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  ack(@Param("id") id: string) { return this.keywordSearchesService.ack(id); }
}
```

The `@RateLimit({ limit: 10, windowMs: 60_000 })` on `create` mirrors `DiscoveryController.run`'s manual-trigger rate limit — this is the endpoint that enqueues a real YouTube-quota-spending job, same risk shape as a manual discovery run.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @yvi/api test -- keyword-searches.controller`
Expected: PASS.

- [ ] **Step 9: Create `apps/api/src/keyword-searches/keyword-searches.module.ts`**

```ts
@Module({
  controllers: [KeywordSearchesController],
  providers: [KeywordSearchesService],
})
export class KeywordSearchesModule {}
```

- [ ] **Step 10: Delete the `discovery` module and swap it in `app.module.ts`**

Delete `apps/api/src/discovery/discovery.controller.ts`, `discovery.controller.test.ts`, `discovery.service.ts`, `discovery.service.test.ts`, `discovery.module.ts`. In `apps/api/src/app.module.ts`, replace the `DiscoveryModule` import and its entry in `imports: [...]` with `KeywordSearchesModule`.

- [ ] **Step 11: Run the full `@yvi/api` test suite**

Run: `pnpm --filter @yvi/api test`
Expected: PASS — no remaining reference to `discovery.*` anywhere (confirm with `grep -r "discovery" apps/api/src --include=*.ts -il` returning nothing outside this plan's own renames), no regressions elsewhere.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/keyword-searches apps/api/src/app.module.ts
git rm apps/api/src/discovery/discovery.controller.ts apps/api/src/discovery/discovery.controller.test.ts apps/api/src/discovery/discovery.service.ts apps/api/src/discovery/discovery.service.test.ts apps/api/src/discovery/discovery.module.ts
git commit -m "feat(api): replace discovery module with keyword-searches module"
```

---

### Task 6: `apps/web` — `/search` screen, sidebar badge, delete `/discovery`

**Files:**
- Create: `apps/web/app/(dashboard)/search/page.tsx`
- Create: `apps/web/app/(dashboard)/search/page.test.ts`
- Create: `apps/web/app/(dashboard)/search/actions.ts`
- Create: `apps/web/app/(dashboard)/search/actions.test.ts`
- Create: `apps/web/app/(dashboard)/search/search.module.css`
- Modify: `apps/web/components/sidebar.tsx`
- Create: `apps/web/components/sidebar.test.tsx`
- Delete: `apps/web/app/(dashboard)/discovery/page.tsx`, `page.test.ts`, `actions.ts`, `actions.test.ts`, `discovery.module.css`

**Interfaces:**
- Consumes: `fetchApi`, `ApiError` (`../../../lib/api`); `KeywordSearchDto`, `CreateKeywordSearchBody` shape from Task 5 (duplicated locally as a `.ts`/`.tsx` interface, same convention `discovery/page.tsx` already used for `DiscoveryQueryDto`); `MarketDto` (same shape `discovery/page.tsx` already defines, copy verbatim).
- Produces: the `/search` route; `Sidebar`'s nav entry renamed `"Search"` with `href: "/search"` replacing `"Discovery Sources"`/`"/discovery"`.

- [ ] **Step 1: Write failing tests in `apps/web/app/(dashboard)/search/actions.test.ts`**

Mirror `discovery/actions.test.ts`'s mocking style exactly (`vi.mock("../../../lib/api", ...)`, `vi.mock("next/cache", ...)`, `vi.mock("next/navigation", ...)`). Cases:

```ts
describe("createKeywordSearch", () => {
  it("posts query/marketId/language as a JSON body and revalidates /search", async () => { ... });
  it("redirects with a rate-limited flag on a 429", async () => { ... }); // mirrors triggerDiscoveryRun's 429 handling
  it("rethrows a non-429 error", async () => { ... });
});
describe("ackKeywordSearch", () => {
  it("posts the ack endpoint and revalidates /search", async () => { ... });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/web test -- search/actions`
Expected: FAIL with "Cannot find module './actions'".

- [ ] **Step 3: Implement `apps/web/app/(dashboard)/search/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, fetchApi } from "../../../lib/api";

export async function createKeywordSearch(formData: FormData): Promise<void> {
  const body = {
    query: String(formData.get("query") ?? ""),
    marketId: String(formData.get("marketId") ?? ""),
    language: String(formData.get("language") ?? ""),
  };
  try {
    await fetchApi("/keyword-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      redirect("/search?error=rate_limited");
    }
    throw error;
  }
  revalidatePath("/search");
}

export async function ackKeywordSearch(id: string): Promise<void> {
  await fetchApi(`/keyword-searches/${id}/ack`, { method: "POST" });
  revalidatePath("/search");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @yvi/web test -- search/actions`
Expected: PASS.

- [ ] **Step 5: Write failing tests in `apps/web/app/(dashboard)/search/page.test.ts`**

Mirror `discovery/page.test.ts`'s style. Cases:

```ts
it("fetches keyword searches and markets", async () => { ... }); // asserts fetchApi called with "/keyword-searches" and "/markets"
it("renders without throwing when the history list is empty", async () => { ... });
it("renders the rate-limited message when searchParams.error is set", async () => { ... });
it("renders without throwing when history rows and markets are returned", async () => { ... });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @yvi/web test -- search/page`
Expected: FAIL with "Cannot find module './page'".

- [ ] **Step 7: Implement `apps/web/app/(dashboard)/search/page.tsx` and `search.module.css`**

Copy `discovery/page.tsx`'s structure: a keyword/market/language submit form (`action={createKeywordSearch}`, fields `query`/`marketId`/`language`, no `strategy`/`priority`/`maxPagesPerRun`/`frequencyMinutes` — those are gone with `DiscoveryQuery`), and a history table (columns: Query, Market, Status, Videos found, Recommended found, Started, Error, a per-row "Dismiss" button bound to `ackKeywordSearch.bind(null, row.id)` shown only when `row.status === "completed" || row.status === "failed"` and `row.acknowledgedAt === null`). Fetch both lists with `Promise.all([fetchApi<KeywordSearchDto[]>("/keyword-searches"), fetchApi<MarketDto[]>("/markets")])`. Copy `discovery.module.css` to `search.module.css` verbatim (same class names, same styling — no new visual language needed for this page).

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @yvi/web test -- search/page`
Expected: PASS.

- [ ] **Step 9: Write failing tests in `apps/web/components/sidebar.test.tsx`**

New file (`sidebar.tsx` has none today). Cases:

```ts
it("renders a Search nav link pointing at /search", async () => { ... });
it("does not render a Discovery Sources link", async () => { ... });
it("shows no badge when fetchApi returns an empty unseen list", async () => { ... });
it("shows the unseen count as a badge when fetchApi returns unseen completed searches", async () => { ... });
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `pnpm --filter @yvi/web test -- sidebar`
Expected: FAIL — `Sidebar` is not yet `async`/does not fetch, and `/search`/badge markup doesn't exist.

- [ ] **Step 11: Implement the sidebar changes in `apps/web/components/sidebar.tsx`**

Make `Sidebar` an `async function Sidebar()` (Server Component — `DashboardLayout` already renders it directly inside an un-awaited JSX position, which Next.js supports for async Server Components; no caller change needed). Replace the `{ label: "Discovery Sources", href: "/discovery" }` entry with `{ label: "Search", href: "/search" }`. Before the `NAV_ITEMS` map, fetch `const unseen = await fetchApi<KeywordSearchDto[]>("/keyword-searches?unseen=true")` (import `fetchApi` from `../lib/api`; duplicate the minimal `KeywordSearchDto` shape needed, just `{ id: string }`, matching the project's existing per-file DTO-duplication convention). Render a small badge span with `unseen.length` next to the "Search" link's label when `unseen.length > 0`, styled with a new `.badge` rule appended to `sidebar.module.css` (small rounded count pill, reusing the existing `--color-*` CSS variables the way every other module does).

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm --filter @yvi/web test -- sidebar`
Expected: PASS.

- [ ] **Step 13: Delete the `discovery` route**

Delete `apps/web/app/(dashboard)/discovery/page.tsx`, `page.test.ts`, `actions.ts`, `actions.test.ts`, `discovery.module.css`.

- [ ] **Step 14: Run the full `@yvi/web` test suite**

Run: `pnpm --filter @yvi/web test`
Expected: PASS — confirm with `grep -r "discovery" apps/web --include=*.ts --include=*.tsx -il` returning nothing.

- [ ] **Step 15: Manual smoke test in a browser**

Start the stack (`docker compose up -d` for Postgres/Redis if not already running, then `pnpm --filter @yvi/api dev`, `pnpm --filter @yvi/worker dev`, `pnpm --filter @yvi/web dev`), log in, navigate to `/search`, submit a keyword against an enabled market, confirm the history row appears as `queued` then (after the worker picks it up) transitions to `completed`/`failed` on a page refresh, confirm the sidebar badge appears after a completed run and clears after clicking "Dismiss", confirm `/discovery` now 404s.

- [ ] **Step 16: Commit**

```bash
git add apps/web/app/\(dashboard\)/search apps/web/components/sidebar.tsx apps/web/components/sidebar.test.tsx apps/web/components/sidebar.module.css
git rm -r apps/web/app/\(dashboard\)/discovery
git commit -m "feat(web): add /search screen with unseen-search sidebar badge, remove /discovery"
```

---

## Self-Review

**1. Spec coverage.** Design doc Goals → Task 6 (screen + status visibility via history table) and Task 1/Task 4 (background job, status transitions). Non-goals/Anti-goals → Global Constraints + Review Focus cover the zero-result, quota-block, and bounded-scrape-volume cases explicitly; the "doesn't disable other schedulers" anti-goal is pinned in Task 4 Step 10's instruction to touch only two `main.ts` call sites. Constraints (gentle scraping reused, no evasion) → Task 3 moves `recommended-scrape.ts`'s logic verbatim, no behavior change. Decided section: `KeywordSearch` model → Task 1; queue+processor steps 1-5 → Task 4 (with steps 3-4 built on Tasks 2/3's extractions); API shape → Task 5; web screen + sidebar rename/badge → Task 6; scheduler wiring → Task 4 Step 10; `DiscoveryQuery` table left in place / admin surface removed → Task 5/Task 6 delete only the API/web layers, schema untouched. "What's left to whoever implements this" — all five bullets are resolved by this plan's own decisions (extraction shape in Tasks 2-3's Interfaces blocks; caps as Global Constraints; badge placement/ack flow in Task 6; naming in Task 1/4/5's Interfaces; no-other-caller confirmed by Task 5 Step 11's grep check).

**2. Step scan.** Each test step names its exact case list; each implementation step gives an exact signature plus, where the body isn't fully determined by the signature and existing tests (the `keyword-search.ts` processor's control flow, which several tasks' worth of extracted pieces compose together for the first time), a full reference implementation. No step says "handle edge cases" or leaves a signature undefined.

**3. Type consistency.** `EnrichVideoIdsProgress`/`enrichVideoIds` (Task 2) is consumed with the identical field names in Task 4 Step 7. `ScrapeRecommendedResult`/`scrapeRecommendedForSeeds`/`MAX_SEEDS_PER_RUN` (Task 3) match their Task 4 Step 7 usage. `KeywordSearchJobData` (Task 4 Step 1) matches the `{ jobRunId, keywordSearchId, query, marketId, language }` object Task 5 Step 3's `.add()` call constructs. `KeywordSearchDto` (Task 5) matches the fields Task 6's page/sidebar read. `FinishKeywordSearchInput`/`finishKeywordSearch` (Task 1) match the call in Task 4 Step 7 exactly.

**4. Review Focus.** All five lines have an owning task's test case: empty results → Task 4's `it("ends completed with videosFound=0...")`; quota block mid-run → Task 4's `it("...persists the videosFound count completed so far...")`; disabled/unknown market → Task 5's `it("create rejects...")` cases; ack-while-running → Task 5's `it("ack rejects...queued or running")`; thin/degraded sidebar scrape → Task 3's `it("logs a degradation warning...")` plus Task 4's `it("...0 recommendedVideosFound but videosFound>0...")`.

**5. Proportion.** The design doc is ~185 lines; this plan is substantially longer, but the overage is concentrated in one place — Task 4 Step 7's full reference body — because that processor is the first point where four previously-separate concerns (job-status bookkeeping, quota-guarded search, in-process enrichment, in-process scrape) compose for the first time, and no existing file shows that composition for a reviewer to be pointed at instead. Every other step is signature-plus-test-names, matching existing sibling files closely enough that a one-line "mirror X" reference was sufficient instead of a repeated body.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-12-on-demand-keyword-discovery.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Subagent-driven**, because Tasks 2-4 form a dependency chain where a mistake in the Task 2/3 extractions (e.g. `enrichVideoIds` silently losing the partial-progress-on-throw behavior) would surface correctly in that task's own tests but then get silently relied on by Task 4's control flow — a per-task fresh reviewer catches that drift before it compounds, where a single end-of-branch review might only notice the symptom in Task 4 and have to trace it back. Does the plan capture what you want, and which approach should we use?
