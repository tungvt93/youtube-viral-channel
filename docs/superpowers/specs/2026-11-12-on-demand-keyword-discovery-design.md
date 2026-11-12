# On-Demand Keyword Search & Recommended Expansion — Design

Date: 2026-11-12
Status: proposed (pending builder check + user approval)
Depends on: `docs/decisions/0005-on-demand-keyword-search-discovery.md`,
`docs/decisions/0004-recommended-videos-scraping-exception.md`

## Intent and why

Discovery currently runs on always-on schedulers the user no longer
wants: a periodic "regional viral chart" poll and a periodic
admin-configured keyword search, plus a separate 6-hour background tick
that expands discovery via YouTube's recommended-sidebar scrape once a
video has already proven itself (`high_signal`/`cooling`).

The user's real workflow is simpler: type a keyword, get a one-time
background job that finds videos for it and immediately walks the
recommended sidebar around those specific results, then tells them when
it's done. [[0005-on-demand-keyword-search-discovery]] authorizes
replacing the periodic/admin-configured trigger with this on-demand one;
this document is the concrete design for that replacement.

## Goals

- A new web screen where the user types one keyword (+ picks market/
  language) and submits a one-off search.
- The job runs entirely in the background (BullMQ); the screen/dashboard
  reflects `queued` → `running` → `completed`/`failed` status without the
  user needing to keep the tab open.
- On completion, a visible marker appears in the dashboard until the user
  has seen it, plus a browsable history of past searches (keyword,
  status, videos-found count, recommended-videos-found count).
- One pipeline per submitted keyword: `search.list` → enrich results into
  `Video` rows → recommended-sidebar scrape directly off those same
  results — with no dependency on `monitoringState` ever reaching
  `high_signal`/`cooling`.
- No periodic scheduler remains for any discovery strategy; everything
  above is purely request-driven.

## Non-goals

- No new discovery strategies beyond keyword search — channel expansion
  (§6.4) and topic expansion (§6.5) are untouched.
- Not resurrecting the regional `mostPopular` strategy's UI — its code
  stays per decision 0005, but gets no caller.
- Not building multi-level/recursive recommended expansion (recommended-
  of-recommended) within one run — one hop per search, same depth the
  prior periodic tick did per tick, just invoked on demand.
- Not adding multi-user/per-user job isolation — MVP stays single-user;
  concurrent searches just queue normally in BullMQ.

## Anti-goals (failure even if it technically runs)

- A submitted keyword silently does nothing visible (e.g. 0 results, or
  an error) — any outcome, including zero-result and failure, must show
  up in the job's status/history, not just in logs.
- The user has to remember to refresh/poll to learn a search finished —
  the dashboard must surface the "new result" marker on its own.
- This change accidentally also disables the still-needed ticks for
  video-monitoring, video-scoring, channel-video-discovery, channel-
  scoring, video-classification, topic-normalization, topic-trend-
  aggregation, or system-alerts. This project's blast radius in
  `schedulers/index.ts` is exactly three registrations: discovery-
  regional, discovery-search, recommended-scrape — nothing else there
  changes.
- Recommended-scrape volume balloons per search (e.g. scraping every one
  of 50 search results with no cap/delay) — must stay bounded and gentle
  per decision 0004's intent even with the `monitoringState` gate gone.

## Constraints (carried from decisions 0004/0005 and this conversation)

- Personal/MVP, single user (PRD §3.3) — no auth-scoping needed on the
  new job/table beyond what already exists.
- Gentle-scraping behavior is unchanged: sequential fetches, randomized
  delay between them, circuit breaker on repeated failure — reuse
  `recommended-scrape.ts`'s existing fetch/parse/backoff logic as-is,
  don't rewrite it.
- No proxy rotation / evasion — unchanged from decision 0004.
- `most_popular` strategy code, queue, and processor stay in the tree,
  just never scheduled and no longer reachable from any UI (decision
  0005, point 1).
- `discoverySearch` and `recommendedScrape` queues/processors are reused,
  not rewritten — only triggering/wiring changes.

## Decided (the builder's calls, stated so they can be reviewed)

- **New DB model `KeywordSearch`** (`packages/db` schema + migration):
  `id`, `query` (text), `marketId` (FK `Market`), `language`, `status`
  (`queued`|`running`|`completed`|`failed`), `jobRunId` (ties to the
  existing generic `JobRun` row for worker-side observability — reuse
  `startJobRun`/`finishJobRun` exactly like every other processor),
  `videosFound` (int, null until finished), `recommendedVideosFound`
  (int, null until finished), `errorMessage` (nullable), `createdAt`,
  `finishedAt`, `acknowledgedAt` (nullable — null means "unseen"; set when
  the user views/dismisses it, driving the dashboard badge).
- **New queue + processor** `apps/worker/src/processors/keyword-search.ts`
  (`KeywordSearchJobData { keywordSearchId, query, marketId, language }`):
  1. Mark `KeywordSearch.status = "running"`.
  2. Call `deps.youtube.search(...)` the same way `discovery-search.ts`
     does, capped to one page / up to 50 results (first-cut constant, not
     calibrated — same caveat the 2026-11-11 design doc used for its own
     numbers), recording API usage the same way.
  3. For each result, enrich it synchronously in-process — reuse the
     `videos.list` + upsert logic `video-enrichment.ts` already has,
     called as a function rather than fired onto the `videoEnrichment`
     queue, so this processor can wait for real `Video` rows before
     step 4. This call still goes through the existing `checkQuotaGuard`/
     `recordApiUsage` path unchanged — the on-demand search shares the
     same daily YouTube API budget as the still-running video-monitoring/
     scoring/channel-discovery ticks, it does not get its own reserved
     pool. If the guard blocks here (or at step 2), the whole
     `KeywordSearch` ends `status = "failed"` with an `errorMessage`
     naming the quota block — never silently `"completed"` with an empty
     result, so the user doesn't mistake "the system is out of budget"
     for "this keyword has no videos."
  4. For every resulting `Video` row, run the same per-seed logic
     `recommended-scrape.ts` already has (`fetchWatchPageHtml` →
     `parseRecommendedVideos` → known/new split → `DiscoveryEvent` write +
     enrichment-queue fan-out for genuinely new ids), same cap/delay
     pattern as `MAX_SEEDS_PER_TICK`/`DELAY_MIN_MS`/`DELAY_MAX_MS` — but
     seeded directly from this search's own results, not from a
     `monitoringState` query. The `DiscoveryEvent.source` value written
     for the keyword-search enrichment step (step 3) is a new value,
     `"keyword_search"` — distinct from the periodic path's `"search"`
     (which also assumes a non-null `discoveryQueryId`, always null here)
     — so on-demand and the now-dormant periodic-admin search stay
     distinguishable in history/analytics. The recommended-scrape step
     (step 4) keeps writing `"recommended_scrape"` as it already does.
  5. Update `KeywordSearch` with final counts and `status = "completed"`
     (or `"failed"` + `errorMessage` on a thrown error); call
     `finishJobRun` on the paired `JobRun`. On a mid-run failure (e.g. a
     thrown error partway through steps 3-4), persist whatever
     `videosFound`/`recommendedVideosFound` counts had actually completed
     so far rather than leaving them null — the `Video`/`DiscoveryEvent`
     rows and enrichment-queue jobs already written by the partial run are
     not rolled back either way, so the reported counts should match what
     the database actually ended up with.
  - Steps 3–4's logic should be extracted into functions callable both
    from their existing queue processors and from this new one, rather
    than duplicated — exact shape (split the existing processor bodies vs.
    import+call internals) is left to implementation.
- **API:** new endpoints — naming left to implementation, but shaped as:
  `POST /keyword-searches` (body: `query`, `marketId`, `language`) creates
  the `KeywordSearch` row, enqueues the job, returns its id;
  `GET /keyword-searches` lists history; `GET /keyword-searches/:id`
  returns single status (for polling); a small
  `POST /keyword-searches/:id/ack` marks it seen.
- **Web:** new screen under `apps/web/app/(dashboard)/search/` (keyword
  input, market/language pickers, submit button, history table with
  status + counts — same visual pattern as other dashboard pages) fully
  replaces `apps/web/app/(dashboard)/discovery/` (that route, its
  `actions.ts`, and its module CSS are deleted). `components/sidebar.tsx`
  renames/repoints its "Discovery" nav entry to "Search" and gains a
  small unseen-completed-search indicator — exact placement left to
  implementation to match existing visual language.
- **Scheduler wiring:** wherever worker bootstrap currently calls
  `registerDiscoverySchedulers` and `registerRecommendedScrapeScheduler`,
  stop calling them. The functions themselves stay in
  `schedulers/index.ts` (decision 0005: keep code, disable scheduling) so
  they can be re-enabled with a one-line change later. Register the new
  `keyword-search` queue's worker processor instead — it needs no
  scheduler, since the API enqueues it directly rather than on a repeat.
- **`DiscoveryQuery` table/admin surface:** once the Discovery Sources
  page is removed, nothing creates/edits/reads `DiscoveryQuery` rows
  anymore. Leave the table itself in place (no destructive migration);
  remove the now-dead `apps/api/src/discovery/*` controller/service/module
  and the web `discovery/` route together with the page replacement above,
  since they exist purely to serve the page being removed.

## What's left to whoever implements this

- Exact shape of the shared-logic extraction in steps 3–4 above.
- Exact caps: search page count (decided default: 1 page / up to 50
  results) and how many of those results feed into the recommended-scrape
  step (decided default: all of them, same per-run cap pattern as
  `MAX_SEEDS_PER_TICK`) — first-cut constants, tune after real usage.
- Exact UI placement/visual treatment of the "unseen completed search"
  indicator.
- Final naming: `KeywordSearch` model/table, API module name (`search` vs.
  reusing `discovery`), new queue name — implementation's call, consistent
  with existing conventions (`camelCase` TS / `snake_case` DB columns,
  `QUEUE_NAMES` in `@yvi/shared`).
- Confirming no other caller of the soon-removed `apps/api/src/discovery/*`
  module exists before deleting it.
