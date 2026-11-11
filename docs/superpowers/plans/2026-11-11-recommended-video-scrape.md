# Recommended-Video Scrape Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new worker processor that expands discovery outward from existing viral-candidate videos by scraping YouTube's "recommended videos" sidebar (`ytInitialData`), feeding genuinely new videos through the existing enrichment/scoring pipeline, targeted at the seed's own market and self-limiting its recursion to videos that themselves clear the candidate threshold.

**Architecture:** One new periodic BullMQ tick (`recommended-scrape`), structurally identical to `channel-video-discovery.ts`'s "re-select due rows, per-item independent try/catch, diff-then-enqueue" shape, but with zero YouTube Data API calls — it fetches public watch-page HTML directly with the Node 20 global `fetch`. Two new small modules under `apps/worker/src/scrape/` isolate the HTTP fetch and the `ytInitialData` parse from the BullMQ processor itself. New videos are *not* written to `DiscoveryEvent` by this processor directly — they're enqueued onto the existing `video-enrichment` queue (same as `channel-video-discovery.ts` does for `channel_uploads`), carrying a new optional `sourcePayload` field through `VideoEnrichmentJobData` so `video-enrichment.ts` writes the lineage-bearing `DiscoveryEvent` itself, at the point the video's internal id first exists. Already-known videos get a `DiscoveryEvent` written directly by the new processor (no internal id problem — the video already exists).

**Tech Stack:** TypeScript, BullMQ, Prisma (`@yvi/db`), Vitest. No new dependency — Node's global `fetch` (engines: `>=20.0.0`) covers the HTTP GET; no HTML parser is needed since the target data is a JSON blob inside a `<script>` tag, extracted by regex and `JSON.parse`.

**Spec:** `docs/superpowers/specs/2026-11-11-recommended-video-scrape-design.md` (depends on `docs/decisions/0004-recommended-videos-scraping-exception.md`)

## Global Constraints

- Personal/MVP scope only; this path makes zero YouTube Data API calls (no quota guard needed, same reasoning as `channel-scoring.ts`/`system-alerts.ts`).
- Sequential fetches only, 3–5s delay between requests within a batch — never parallel/bursty.
- No proxy rotation, no CAPTCHA bypass, no retry-until-success against a block. A blocked/broken fetch is a dead source for that attempt, not a target to route around.
- Seeds are restricted to `Video.monitoringState IN ('candidate', 'monitoring')` and never re-scraped once attempted (`recommendedScrapedAt IS NULL` gate).
- Every hop in a multi-hop chain uses the **original** (root) seed's `gl`/`hl` — never a later hop's own channel country.
- New videos found via scraping go through the exact same `video-enrichment` → `video-scoring` pipeline as any other discovered video — no parallel upsert/scoring code path.
- Batch size (20 seeds/run), delay (3–5s), and schedule (6h) are first-cut constants, not calibrated — same status as `RECENCY_TAU_HOURS` and the niche-breakout thresholds in [[0003-niche-breakout-signal]].

## Review Focus

- A seed video whose earliest `DiscoveryEvent` has no resolvable market (e.g. `marketId` is `null` because it came from `channel_uploads`, or a `recommended_scrape` event's `sourcePayload` is somehow malformed) — the processor must skip it (and still mark it scraped) rather than crawling with an empty/garbage `gl`/`hl`.
- A watch page that returns 200 but with a consent/cookie-wall redirect instead of the real page (no `ytInitialData` present at all) — must be treated as a parse failure, not a crash, and still advance `recommendedScrapedAt`.
- A sidebar that scrapes cleanly but yields zero recommended video ids (a legitimately sparse video, vs. a markup change) — must not be misclassified as a hard failure for the circuit breaker, but must still feed the rolling-average degradation signal.
- A scraped id that already exists as a `Video` row — must still produce a `DiscoveryEvent` (the recommendation-graph edge matters for later analysis) but must never re-enqueue enrichment for it.
- More than half of a batch's seeds fail (non-200, consent wall, or parse failure) — the circuit breaker must stop the rest of that run's batch early rather than continuing to hammer a wider block/outage.

---

## File Structure

- Create: `apps/api/prisma/migrations/<timestamp>_add_video_recommended_scraped_at/migration.sql` (via `prisma migrate dev`)
- Modify: `apps/api/prisma/schema.prisma` — add `Video.recommendedScrapedAt`
- Create: `apps/worker/src/scrape/fetch-watch-page.ts` — plain HTTP GET + User-Agent
- Create: `apps/worker/src/scrape/fetch-watch-page.test.ts`
- Create: `apps/worker/src/scrape/parse-recommended.ts` — `ytInitialData` extraction + sidebar walk
- Create: `apps/worker/src/scrape/parse-recommended.test.ts`
- Modify: `packages/db/src/repositories/markets.ts` — add `getMarketByCode`
- Modify: `packages/db/src/repositories/markets.test.ts`
- Modify: `packages/db/src/repositories/videos.ts` — add `listRecommendedScrapeSeeds`, `markVideoRecommendedScraped`, `getVideoIdsByYoutubeIds`
- Modify: `packages/db/src/repositories/videos.test.ts`
- Modify: `packages/db/src/index.ts` — export the new markets/videos functions and types
- Modify: `packages/shared/src/queues.ts` — add `recommendedScrape` to `QUEUE_NAMES`, add `RecommendedScrapeJobData`, widen `VideoEnrichmentJobData` with optional `sourcePayload`
- Modify: `apps/worker/src/processors/video-enrichment.ts` — thread `job.data.sourcePayload` into `createDiscoveryEvent`
- Modify: `apps/worker/src/processors/video-enrichment.test.ts`
- Create: `apps/worker/src/processors/recommended-scrape.ts`
- Create: `apps/worker/src/processors/recommended-scrape.test.ts`
- Modify: `apps/worker/src/processors/deps.ts` — add optional `fetchImpl` injection
- Modify: `apps/worker/src/processors/index.ts` — export `createRecommendedScrapeProcessor`
- Modify: `apps/worker/src/queues/index.ts` — add `recommendedScrape: Queue`
- Modify: `apps/worker/src/schedulers/index.ts` — add `registerRecommendedScrapeScheduler`
- Modify: `apps/worker/src/schedulers/index.test.ts`
- Modify: `apps/worker/src/main.ts` — wire the new Worker + scheduler + logger string

---

### Task 1: Schema — `Video.recommendedScrapedAt`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Video model, after `nextSnapshotDueAt`)
- Create: migration via `prisma migrate dev`

**Interfaces:**
- Produces: `Video.recommendedScrapedAt: Date | null` on the generated Prisma `Video` type, consumed by Task 3's repository functions.

- [ ] **Step 1: Add the column**

In `apps/api/prisma/schema.prisma`, inside `model Video`, add directly after `nextSnapshotDueAt`:

```prisma
  recommendedScrapedAt  DateTime? @map("recommended_scraped_at")
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @yvi/api exec prisma migrate dev --name add_video_recommended_scraped_at --schema prisma/schema.prisma`
Expected: a new `apps/api/prisma/migrations/<timestamp>_add_video_recommended_scraped_at/migration.sql` containing `ALTER TABLE "videos" ADD COLUMN "recommended_scraped_at" TIMESTAMP(3);`, and the Prisma client regenerates with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add Video.recommendedScrapedAt column"
```

---

### Task 2: `getMarketByCode`

**Files:**
- Modify: `packages/db/src/repositories/markets.ts`
- Modify: `packages/db/src/repositories/markets.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `getMarketByCode(db: PrismaClient, code: string): Promise<Market | null>`, consumed by Task 6's `recommended-scrape.ts` to resolve a `Market.id` for `DiscoveryEvent.marketId` from a scraped seed's `gl` code.

- [ ] **Step 1: Write the failing test**

```ts
describe("getMarketByCode", () => {
  it("looks up a market by its two-letter code", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "market-1", code: "US" });
    const db = { market: { findUnique } } as unknown as PrismaClient;

    await getMarketByCode(db, "US");

    expect(findUnique).toHaveBeenCalledWith({ where: { code: "US" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yvi/db exec vitest run src/repositories/markets.test.ts`
Expected: FAIL — `getMarketByCode is not a function` / import error.

- [ ] **Step 3: Implement `getMarketByCode` in `packages/db/src/repositories/markets.ts`**

```ts
export function getMarketByCode(db: PrismaClient, code: string): Promise<Market | null> {
  return db.market.findUnique({ where: { code } });
}
```

- [ ] **Step 4: Export it from `packages/db/src/index.ts`**

Add `getMarketByCode` to the existing `export { getMarketById, listAllMarkets, listEnabledMarkets, updateMarketEnabled } from "./repositories/markets";` line.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @yvi/db exec vitest run src/repositories/markets.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/markets.ts packages/db/src/repositories/markets.test.ts packages/db/src/index.ts
git commit -m "feat(db): add getMarketByCode lookup"
```

---

### Task 3: Seed-selection and bookkeeping repository functions

**Files:**
- Modify: `packages/db/src/repositories/videos.ts`
- Modify: `packages/db/src/repositories/videos.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `Video.recommendedScrapedAt` (Task 1).
- Produces:
  - `interface RecommendedScrapeSeed { videoId: string; youtubeVideoId: string; gl: string; hl: string; rootSeedVideoId: string }`
  - `listRecommendedScrapeSeeds(db: PrismaClient, limit: number): Promise<RecommendedScrapeSeed[]>`
  - `markVideoRecommendedScraped(db: PrismaClient, videoId: string, scrapedAt: Date): Promise<void>`
  - `getVideoIdsByYoutubeIds(db: PrismaClient, youtubeVideoIds: string[]): Promise<Map<string, string>>` (maps `youtubeVideoId -> internal id`, for videos that already exist)

  All three consumed by Task 6's `recommended-scrape.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("listRecommendedScrapeSeeds", () => {
  it("resolves gl/hl from the earliest DiscoveryEvent's market for a first-generation seed", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "v1",
        youtubeVideoId: "yt1",
        discoveryEvents: [
          { source: "search", sourcePayload: null, market: { code: "US", defaultLanguage: "en" } },
        ],
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([{ videoId: "v1", youtubeVideoId: "yt1", gl: "US", hl: "en", rootSeedVideoId: "v1" }]);
  });

  it("reuses the root seed's gl/hl verbatim from sourcePayload for a recommended_scrape-origin seed", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "v2",
        youtubeVideoId: "yt2",
        discoveryEvents: [
          {
            source: "recommended_scrape",
            sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" },
            market: null,
          },
        ],
      },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([{ videoId: "v2", youtubeVideoId: "yt2", gl: "US", hl: "en", rootSeedVideoId: "v1" }]);
  });

  it("skips a seed whose earliest DiscoveryEvent has no resolvable market", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "v3", youtubeVideoId: "yt3", discoveryEvents: [{ source: "channel_uploads", sourcePayload: null, market: null }] },
    ]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const seeds = await listRecommendedScrapeSeeds(db, 20);

    expect(seeds).toEqual([]);
  });
});

describe("markVideoRecommendedScraped", () => {
  it("sets recommendedScrapedAt on the given video", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { video: { update } } as unknown as PrismaClient;
    const scrapedAt = new Date("2026-11-11T00:00:00Z");

    await markVideoRecommendedScraped(db, "v1", scrapedAt);

    expect(update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { recommendedScrapedAt: scrapedAt } });
  });
});

describe("getVideoIdsByYoutubeIds", () => {
  it("maps youtube video ids to internal ids for videos that already exist", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "v1", youtubeVideoId: "yt1" }]);
    const db = { video: { findMany } } as unknown as PrismaClient;

    const map = await getVideoIdsByYoutubeIds(db, ["yt1", "yt2"]);

    expect(map).toEqual(new Map([["yt1", "v1"]]));
  });

  it("returns an empty map without querying for an empty input", async () => {
    const findMany = vi.fn();
    const db = { video: { findMany } } as unknown as PrismaClient;

    const map = await getVideoIdsByYoutubeIds(db, []);

    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/db exec vitest run src/repositories/videos.test.ts`
Expected: FAIL — the three new functions don't exist yet.

- [ ] **Step 3: Implement the three functions in `packages/db/src/repositories/videos.ts`**

`listRecommendedScrapeSeeds`: query `db.video.findMany({ where: { monitoringState: { in: ["candidate", "monitoring"] }, recommendedScrapedAt: null }, orderBy: { firstDiscoveredAt: "asc" }, take: limit, select: { id: true, youtubeVideoId: true, discoveryEvents: { orderBy: { discoveredAt: "asc" }, take: 1, select: { source: true, sourcePayload: true, market: { select: { code: true, defaultLanguage: true } } } } } })`, then for each row: if there's no `discoveryEvents[0]`, skip; if `source === "recommended_scrape"`, read `gl`/`hl`/`rootSeedVideoId` from `sourcePayload` (cast to the shape used in Task 6's `ScrapeLineage`) and skip the row if any of those three fields is missing or not a string; otherwise read `gl` from `market.code` and `hl` from `market.defaultLanguage`, `rootSeedVideoId` is the row's own `id`, and skip if `market` is null. Map surviving rows to `RecommendedScrapeSeed`.

`markVideoRecommendedScraped`: `db.video.update({ where: { id: videoId }, data: { recommendedScrapedAt: scrapedAt } })`, return `undefined` (follow `updateChannelLastVideoDiscoveryAt`'s void-return style).

`getVideoIdsByYoutubeIds`: same empty-array short-circuit as `listKnownYoutubeVideoIds`, else `db.video.findMany({ where: { youtubeVideoId: { in: youtubeVideoIds } }, select: { id: true, youtubeVideoId: true } })` folded into a `Map<string, string>` keyed by `youtubeVideoId`.

- [ ] **Step 4: Export the new functions/types from `packages/db/src/index.ts`**

Add `getVideoIdsByYoutubeIds`, `listRecommendedScrapeSeeds`, `markVideoRecommendedScraped` to the existing videos export block, and `RecommendedScrapeSeed` to the existing videos type-export block.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @yvi/db exec vitest run src/repositories/videos.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/videos.ts packages/db/src/repositories/videos.test.ts packages/db/src/index.ts
git commit -m "feat(db): add recommended-scrape seed selection and bookkeeping queries"
```

---

### Task 4: `VideoEnrichmentJobData.sourcePayload` and queue plumbing

**Files:**
- Modify: `packages/shared/src/queues.ts`
- Modify: `apps/worker/src/processors/video-enrichment.ts:110-118`
- Modify: `apps/worker/src/processors/video-enrichment.test.ts`
- Modify: `apps/worker/src/queues/index.ts`

**Interfaces:**
- Produces:
  - `QUEUE_NAMES.recommendedScrape = "recommended-scrape"`
  - `type RecommendedScrapeJobData = Record<string, never>`
  - `VideoEnrichmentJobData.sourcePayload?: Record<string, unknown> | null`
  - `Queues.recommendedScrape: Queue`
- Consumed by: Task 6 (`recommended-scrape.ts`), Task 7 (`deps.ts`/scheduler wiring).

- [ ] **Step 1: Write the failing test**

Add to `apps/worker/src/processors/video-enrichment.test.ts` (alongside its existing enrichment-success test — read the current "enriches a batch..." test for the exact mock shape and extend it with a `sourcePayload` field):

```ts
it("passes job.data.sourcePayload through to createDiscoveryEvent, defaulting to null when absent", async () => {
  // ... reuse the existing success-path mocks/setup ...
  await processVideoEnrichment(makeJob({ sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" } }));
  expect(createDiscoveryEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" } }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yvi/worker exec vitest run src/processors/video-enrichment.test.ts`
Expected: FAIL — `createDiscoveryEvent` still receives `sourcePayload: null` unconditionally.

- [ ] **Step 3: Add the field and queue name in `packages/shared/src/queues.ts`**

Add `recommendedScrape: "recommended-scrape"` to `QUEUE_NAMES`. Add `sourcePayload?: Record<string, unknown> | null;` to `VideoEnrichmentJobData`, with a one-line comment: lineage metadata for `recommended_scrape`-sourced items, threaded verbatim into `createDiscoveryEvent`; absent/null for every other source. Add `export type RecommendedScrapeJobData = Record<string, never>;` below the existing empty-job-data types, with the same one-line "empty on purpose" comment style as `ChannelVideoDiscoveryJobData`.

- [ ] **Step 4: Thread it through in `apps/worker/src/processors/video-enrichment.ts:117`**

Change `sourcePayload: null` to `sourcePayload: job.data.sourcePayload ?? null`.

- [ ] **Step 5: Add the queue in `apps/worker/src/queues/index.ts`**

Add `recommendedScrape: Queue;` to the `Queues` interface and `recommendedScrape: new Queue(QUEUE_NAMES.recommendedScrape, { connection }),` to `createQueues`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker exec vitest run src/processors/video-enrichment.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/queues.ts apps/worker/src/processors/video-enrichment.ts apps/worker/src/processors/video-enrichment.test.ts apps/worker/src/queues/index.ts
git commit -m "feat(worker): thread scrape lineage through video-enrichment, add recommended-scrape queue"
```

---

### Task 5: Fetch and parse modules

**Files:**
- Create: `apps/worker/src/scrape/fetch-watch-page.ts`
- Create: `apps/worker/src/scrape/fetch-watch-page.test.ts`
- Create: `apps/worker/src/scrape/parse-recommended.ts`
- Create: `apps/worker/src/scrape/parse-recommended.test.ts`

**Interfaces:**
- Produces:
  - `const WATCH_PAGE_USER_AGENT: string` and `fetchWatchPageHtml(youtubeVideoId: string, gl: string, hl: string, fetchImpl?: typeof fetch): Promise<string>` — throws `WatchPageFetchError` (new exported class, `{ status: number }`) on a non-200 response.
  - `interface RecommendedVideo { youtubeVideoId: string; sidebarRank: number }`
  - `parseRecommendedVideos(html: string): RecommendedVideo[]` — returns `[]` (never throws) when `ytInitialData` can't be found/parsed/walked, so a markup change degrades to "zero recommendations" rather than crashing a tick.
- Consumed by: Task 6 (`recommended-scrape.ts`).

- [ ] **Step 1: Write the failing fetch test**

```ts
describe("fetchWatchPageHtml", () => {
  it("requests the watch page with gl/hl and a desktop User-Agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("<html></html>") });

    await fetchWatchPageHtml("vid123", "US", "en", fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://www.youtube.com/watch?v=vid123&gl=US&hl=en");
    expect(init.headers["User-Agent"]).toBe(WATCH_PAGE_USER_AGENT);
  });

  it("throws WatchPageFetchError on a non-200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve("") });

    await expect(fetchWatchPageHtml("vid123", "US", "en", fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yvi/worker exec vitest run src/scrape/fetch-watch-page.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `apps/worker/src/scrape/fetch-watch-page.ts`**

```ts
export const WATCH_PAGE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export class WatchPageFetchError extends Error {
  constructor(public readonly status: number) {
    super(`watch page fetch failed with status ${status}`);
  }
}

export async function fetchWatchPageHtml(
  youtubeVideoId: string,
  gl: string,
  hl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `https://www.youtube.com/watch?v=${youtubeVideoId}&gl=${gl}&hl=${hl}`;
  const response = await fetchImpl(url, { headers: { "User-Agent": WATCH_PAGE_USER_AGENT } });
  if (!response.ok) {
    throw new WatchPageFetchError(response.status);
  }
  return response.text();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @yvi/worker exec vitest run src/scrape/fetch-watch-page.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing parse tests**

```ts
describe("parseRecommendedVideos", () => {
  it("extracts recommended video ids in sidebar order from a ytInitialData blob", () => {
    const html = `<html><script>var ytInitialData = ${JSON.stringify({
      contents: {
        twoColumnWatchNextResults: {
          secondaryResults: {
            secondaryResults: {
              results: [
                { compactVideoRenderer: { videoId: "rec1" } },
                { compactVideoRenderer: { videoId: "rec2" } },
                { someOtherRenderer: {} },
              ],
            },
          },
        },
      },
    })};</script></html>`;

    expect(parseRecommendedVideos(html)).toEqual([
      { youtubeVideoId: "rec1", sidebarRank: 0 },
      { youtubeVideoId: "rec2", sidebarRank: 1 },
    ]);
  });

  it("returns an empty array when ytInitialData is absent (e.g. a consent-wall page)", () => {
    expect(parseRecommendedVideos("<html>consent required</html>")).toEqual([]);
  });

  it("returns an empty array when ytInitialData is present but malformed JSON", () => {
    expect(parseRecommendedVideos("<script>var ytInitialData = {not valid json;</script>")).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @yvi/worker exec vitest run src/scrape/parse-recommended.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement `apps/worker/src/scrape/parse-recommended.ts`**

Regex-extract the blob with something like `/var ytInitialData = (\{.*?\});<\/script>/s` (non-greedy up to the first `;</script>` after the opening brace — verify this against a real fetched page during implementation per the spec's own "What's left" caveat, since YouTube may wrap it differently, e.g. `window["ytInitialData"] = ...`; try both patterns). Wrap `JSON.parse` in try/catch returning `[]` on failure. Walk `parsed?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results` (array, may be undefined), filter to entries with a `compactVideoRenderer.videoId`, map to `{ youtubeVideoId, sidebarRank: index }` using the *filtered* array's index (matching the test's expectation that `someOtherRenderer` doesn't consume a rank slot).

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker exec vitest run src/scrape/parse-recommended.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/scrape
git commit -m "feat(worker): add watch-page fetch and ytInitialData recommended-video parser"
```

---

### Task 6: `recommended-scrape` processor

**Files:**
- Create: `apps/worker/src/processors/recommended-scrape.ts`
- Create: `apps/worker/src/processors/recommended-scrape.test.ts`
- Modify: `apps/worker/src/processors/deps.ts`
- Modify: `apps/worker/src/processors/index.ts`

**Interfaces:**
- Consumes: `listRecommendedScrapeSeeds`, `markVideoRecommendedScraped`, `getVideoIdsByYoutubeIds` (Task 3); `getMarketByCode` (Task 2); `fetchWatchPageHtml`, `WatchPageFetchError`, `parseRecommendedVideos`, `RecommendedVideo` (Task 5); `enqueueWithJobRun` (existing); `createDiscoveryEvent`, `startJobRun`, `finishJobRun` (existing); `RecommendedScrapeJobData`, `VideoEnrichmentCandidate`, `QUEUE_NAMES.recommendedScrape` (Task 4).
- Produces: `createRecommendedScrapeProcessor(deps: ProcessorDeps): (job: Job<RecommendedScrapeJobData>) => Promise<{ seedsProcessed: number; newVideosEnqueued: number; knownVideosLinked: number; seedsFailed: number }>`, consumed by Task 7's `main.ts` wiring.

- [ ] **Step 1: Write the failing tests**

Mirror `channel-video-discovery.test.ts`'s mock-hoisting style, mocking `@yvi/db` (`startJobRun`, `finishJobRun`, `listRecommendedScrapeSeeds`, `markVideoRecommendedScraped`, `getVideoIdsByYoutubeIds`, `getMarketByCode`, `createDiscoveryEvent`), `../scrape/fetch-watch-page` (`fetchWatchPageHtml`), `../scrape/parse-recommended` (`parseRecommendedVideos`), and `../job-helpers` (`enqueueWithJobRun`). Cover:

```ts
it("does nothing and completes the JobRun when no seed is due", async () => { /* listRecommendedScrapeSeeds resolves [] */ });

it("enqueues a video-enrichment job per seed for genuinely-new recommended ids, carrying root gl/hl in sourcePayload", async () => {
  // one seed { videoId: "v1", youtubeVideoId: "yt1", gl: "US", hl: "en", rootSeedVideoId: "v1" }
  // fetchWatchPageHtml resolves html; parseRecommendedVideos returns [{ youtubeVideoId: "new1", sidebarRank: 0 }]
  // getVideoIdsByYoutubeIds resolves an empty Map (new1 unknown)
  // getMarketByCode resolves { id: "market-us" }
  // asserts enqueueWithJobRun called with queue "recommended-scrape"-sourced data:
  //   { marketId: "market-us", discoveryQueryId: null, source: "recommended_scrape",
  //     sourcePayload: { seedVideoId: "yt1", rootSeedVideoId: "v1", gl: "US", hl: "en" },
  //     items: [{ videoId: "new1", sourceRank: 0 }] }
  // asserts markVideoRecommendedScraped called with "v1"
});

it("writes a DiscoveryEvent directly (no enrichment enqueue) for an already-known recommended id", async () => {
  // getVideoIdsByYoutubeIds resolves Map([["known1", "internal-known1"]])
  // asserts createDiscoveryEvent called with videoId: "internal-known1", source: "recommended_scrape"
  // asserts enqueueWithJobRun NOT called for this id
});

it("marks the seed scraped and does not throw when the fetch fails", async () => {
  // fetchWatchPageHtml rejects with new WatchPageFetchError(429)
  // asserts markVideoRecommendedScraped still called for that seed
  // asserts the run otherwise completes (seedsFailed: 1)
});

it("marks the seed scraped when parseRecommendedVideos returns an empty array", async () => {
  // fetchWatchPageHtml resolves; parseRecommendedVideos returns []
  // asserts markVideoRecommendedScraped called, no enqueue, no createDiscoveryEvent
});

it("stops processing the rest of the batch once more than half of it has failed", async () => {
  // 4 seeds, first 3 fail fetch -> circuit breaker trips before the 4th seed's fetchWatchPageHtml is called
  // asserts fetchWatchPageHtml called exactly 3 times
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @yvi/worker exec vitest run src/processors/recommended-scrape.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `createRecommendedScrapeProcessor` in `apps/worker/src/processors/recommended-scrape.ts`**

Structure, following `channel-video-discovery.ts`'s shape:

1. `startJobRun` keyed by `job.id`/`job.name`/`QUEUE_NAMES.recommendedScrape`.
2. `const seeds = await listRecommendedScrapeSeeds(deps.db, MAX_SEEDS_PER_TICK)` (constant `= 20`). If empty, `finishJobRun` completed/`resultCount: 0`, return zeros.
3. Loop over seeds with an index; maintain `failedCount`. Before each seed (except the first), if `failedCount > seeds.length / 2`, break the loop (circuit breaker — matches the "stops... once more than half" test, since the break check runs before starting a new seed, not after exactly half fail).
4. Per seed, in a try/catch:
   - `await sleep(randomDelayMs())` between seeds (a small `DELAY_MIN_MS = 3000`/`DELAY_MAX_MS = 5000` module constant pair) — skip the delay before the very first seed.
   - `const html = await fetchWatchPageHtml(seed.youtubeVideoId, seed.gl, seed.hl, deps.fetchImpl)`.
   - `const recommended = parseRecommendedVideos(html)`.
   - Track `recommended.length` into the in-memory rolling-average array (module-level, capped at the last `DEGRADATION_WINDOW_SIZE = 20` runs); if the new average is `< DEGRADATION_WARN_THRESHOLD` (e.g. `1`) across a full window, `log.warn(...)` once per tick (not per seed).
   - If `recommended.length > 0`: `const youtubeIds = recommended.map(r => r.youtubeVideoId)`; `const knownIdMap = await getVideoIdsByYoutubeIds(deps.db, youtubeIds)`; `const market = await getMarketByCode(deps.db, seed.gl)`; build the shared lineage object `{ seedVideoId: seed.youtubeVideoId, rootSeedVideoId: seed.rootSeedVideoId, gl: seed.gl, hl: seed.hl }`.
     - New ids (`!knownIdMap.has(r.youtubeVideoId)`): build `VideoEnrichmentCandidate[]` (`{ videoId, sourceRank: sidebarRank }`), and if non-empty, `enqueueWithJobRun(deps.db, deps.queues.recommendedScrape /* see note below */, ...)` — **note:** the enrichment job is enqueued onto `deps.queues.videoEnrichment` (the existing queue, same as `channel-video-discovery.ts` does), *not* a new queue; `deps.queues.recommendedScrape` is only the tick's own queue. Call `enqueueWithJobRun(deps.db, deps.queues.videoEnrichment, "video-enrichment", { marketId: market?.id ?? null, discoveryQueryId: null, source: "recommended_scrape", discoveredAt: now().toISOString(), sourcePayload: lineage, items: newCandidates }, \`${jobRun.id}:${seed.videoId}\`)`.
     - Known ids: for each, `createDiscoveryEvent(deps.db, { videoId: knownIdMap.get(r.youtubeVideoId)!, marketId: market?.id ?? null, discoveryQueryId: null, source: "recommended_scrape", sourceRank: r.sidebarRank, discoveredAt: now(), sourcePayload: lineage })`.
   - `await markVideoRecommendedScraped(deps.db, seed.videoId, now())` — always, in both the success and the empty-recommendations case.
   - On a caught error (fetch failure): `log.warn({ seedId: seed.videoId, status: "error" }, message)`, `await markVideoRecommendedScraped(deps.db, seed.videoId, now())`, increment `failedCount`.
5. `finishJobRun` completed, `resultCount: newVideosEnqueued`.
6. Return `{ seedsProcessed, newVideosEnqueued, knownVideosLinked, seedsFailed: failedCount }`.

- [ ] **Step 4: Add `fetchImpl` to `ProcessorDeps` in `apps/worker/src/processors/deps.ts`**

Add `fetchImpl?: typeof fetch;` below `now?: () => Date;`, with a one-line comment: injected for `recommended-scrape` tests, same role as `now`.

- [ ] **Step 5: Export from `apps/worker/src/processors/index.ts`**

Add `export { createRecommendedScrapeProcessor } from "./recommended-scrape";`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @yvi/worker exec vitest run src/processors/recommended-scrape.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/processors/recommended-scrape.ts apps/worker/src/processors/recommended-scrape.test.ts apps/worker/src/processors/deps.ts apps/worker/src/processors/index.ts
git commit -m "feat(worker): add recommended-scrape processor"
```

---

### Task 7: Scheduler and `main.ts` wiring

**Files:**
- Modify: `apps/worker/src/schedulers/index.ts`
- Modify: `apps/worker/src/schedulers/index.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `createRecommendedScrapeProcessor` (Task 6), `Queues.recommendedScrape` (Task 4).
- Produces: `RECOMMENDED_SCRAPE_SCHEDULER_ID`, `registerRecommendedScrapeScheduler(queues: Queues): Promise<void>` — a terminal node; nothing downstream consumes it besides `main.ts`.

- [ ] **Step 1: Write the failing scheduler test**

Add a test to `apps/worker/src/schedulers/index.test.ts` matching the existing style for e.g. `registerVideoMonitoringScheduler`:

```ts
describe("registerRecommendedScrapeScheduler", () => {
  it("registers a repeatable job scheduler every 6 hours", async () => {
    const upsertJobScheduler = vi.fn();
    const queues = { recommendedScrape: { upsertJobScheduler } } as unknown as Queues;

    await registerRecommendedScrapeScheduler(queues);

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      RECOMMENDED_SCRAPE_SCHEDULER_ID,
      { every: 6 * 60 * 60 * 1000 },
      { name: QUEUE_NAMES.recommendedScrape, data: {} },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yvi/worker exec vitest run src/schedulers/index.test.ts`
Expected: FAIL — `registerRecommendedScrapeScheduler` doesn't exist.

- [ ] **Step 3: Implement in `apps/worker/src/schedulers/index.ts`**

Following the existing single-static-id pattern exactly:

```ts
export const RECOMMENDED_SCRAPE_SCHEDULER_ID = "recommended-scrape-tick";

const RECOMMENDED_SCRAPE_TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function registerRecommendedScrapeScheduler(queues: Queues): Promise<void> {
  await queues.recommendedScrape.upsertJobScheduler(
    RECOMMENDED_SCRAPE_SCHEDULER_ID,
    { every: RECOMMENDED_SCRAPE_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.recommendedScrape, data: {} },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @yvi/worker exec vitest run src/schedulers/index.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into `apps/worker/src/main.ts`**

- Add `createRecommendedScrapeProcessor` to the `./processors/index` import list and `registerRecommendedScrapeScheduler` to the `./schedulers/index` import list (both alphabetically, matching the existing ordering).
- Add `new Worker(QUEUE_NAMES.recommendedScrape, createRecommendedScrapeProcessor(deps), { connection }),` to the `workers` array.
- Add a `registerRecommendedScrapeScheduler(queues).then(() => logger.info("registered recommended-scrape scheduler")).catch((error) => logger.error({ status: "error" }, \`failed to register recommended-scrape scheduler: ${String(error)}\`));` block, placed after the other `register*Scheduler(queues)` calls.
- Append `, recommended-scrape` to the final `logger.info("worker process started: ...")` string.

- [ ] **Step 6: Typecheck and run the full worker test suite**

Run: `pnpm --filter @yvi/worker run typecheck && pnpm --filter @yvi/worker exec vitest run`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/schedulers/index.ts apps/worker/src/schedulers/index.test.ts apps/worker/src/main.ts
git commit -m "feat(worker): register and wire up the recommended-scrape scheduler"
```

---

## Self-Review

**1. Spec coverage:** Schema change (Task 1), seed selection + gl/hl resolution incl. multi-hop inheritance (Task 3), market lookup for `DiscoveryEvent.marketId` (Task 2), fetch mechanics incl. UA/gl/hl/sequential delay (Task 5), parse mechanics (Task 5), new-vs-known dedup handling incl. same-pipeline enrichment (Task 4 + Task 6), recursion (no explicit step — correctly, since the spec's own "Decided" section states recursion is just the periodic re-scan, which Task 3's `recommendedScrapedAt IS NULL` filter + Task 7's scheduler already provide with no extra code), failure handling + circuit breaker (Task 6), silent-degradation rolling average (Task 6 step 3), scheduling cadence (Task 7). All covered.

**2. Step scan:** Reviewed each step; Task 6 Step 3 is deliberately prose-algorithm (not a transcript) because the signature/tests alone don't pin the control flow of a stateful loop with a circuit breaker and a rolling average — this matches the skill's allowance for "an algorithm the signature and tests do not determine." No step was found that decides nothing (no "TBD"/"handle edge cases" language).

**3. Type consistency:** `RecommendedScrapeSeed` (Task 3) fields (`videoId`, `youtubeVideoId`, `gl`, `hl`, `rootSeedVideoId`) are used identically in Task 6's consumption. `VideoEnrichmentJobData.sourcePayload` (Task 4) matches the lineage object shape built in Task 6 and read back in Task 4's `video-enrichment.ts` change. `ProcessorDeps.fetchImpl` (Task 6 Step 4) matches the `fetchWatchPageHtml` fourth parameter's type (Task 5). `Queues.recommendedScrape` (Task 4 Step 5) matches `RECOMMENDED_SCRAPE_SCHEDULER_ID`'s usage in Task 7.

**4. Review Focus:** All five lines have an owning task/test — see Task 3 (unresolvable-market skip test), Task 5 (consent-wall/malformed-JSON tests), Task 6 (empty-recommendations-vs-failure test, known-id dedup test, circuit-breaker test).

**5. Proportion:** The plan runs longer than the ~170-line spec because it fixes exact file paths, signatures, and test-level assertions the spec left to "whoever implements this" — but code bodies are given only where the spec doesn't fully determine them (the parse walk, the stateful loop in Task 6); every other step is a signature + test name + assertions, not a full transcript.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-11-recommended-video-scrape.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

For this plan I recommend **Subagent-driven**, because Task 6 (the processor itself) is the one task with real cross-cutting risk — a stateful loop combining the circuit breaker, the rolling-average degradation signal, and the new/known dedup branching — and it's worth an independent reviewer's eyes before Task 7 wires it into the live scheduler, rather than discovering a mistake there only at a final whole-branch review. Does the plan capture what you want, and which approach should we use?
