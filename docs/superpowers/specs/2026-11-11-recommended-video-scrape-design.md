# Recommended-Video Scrape Expansion — Design

Date: 2026-11-11
Status: proposed (pending builder check + user approval)
Depends on: `docs/decisions/0004-recommended-videos-scraping-exception.md`

## Intent and why

Discovery today only finds videos already surfaced by YouTube's official
lists: the regional `mostPopular` chart and keyword `search.list`. The
user's actual goal — finding niche/small channels going viral shortly
after upload, by country — isn't well served by either, because both are
either already-popular or keyword-shaped, not graph-shaped. YouTube's
"recommended videos" sidebar (shown next to any watch page) walks a
different graph: videos YouTube itself judges related to a given video,
which is exactly the kind of adjacency that surfaces niche breakouts near
a known-good seed.

There is no compliant API for this (`relatedToVideoId` was removed from
`search.list` years ago), so [[0004-recommended-videos-scraping-exception]]
carved out a narrow, accepted exception to scrape it from the rendered
watch page (`ytInitialData`), scoped to low frequency, no evasion, and
isolated from the main API key.

## Goals

- Expand discovery by walking the recommendation graph outward from
  videos the existing pipeline has already validated as viral candidates.
- Target a specific country per seed, via `gl`/`hl` on the watch-page
  request, matching the seed's market.
- Feed every newly found video through the exact same enrichment +
  scoring pipeline as keyword-search-discovered videos — no parallel
  scoring logic.
- Let the crawl extend recursively (seed → recommended → recommended's
  recommended → ...) but self-limit: a newly found video only becomes a
  seed itself if it independently clears the same
  `meetsViralCandidateThreshold` bar as any other candidate.

## Non-goals

- Not a bulk crawler and not a replacement for the official API — this
  only ever walks outward from videos the official pipeline already
  flagged as candidates.
- Not scraping search-results pages or channel pages — only the watch
  page's recommended/"up next" sidebar.
- Not building a generic scraping framework — this is one narrow,
  purpose-built path.

## Anti-goals (failure even if it technically runs)

- The main YouTube Data API key/project gets throttled, flagged, or
  blocked because of this path. (Mitigated structurally: this path makes
  zero Data API calls — it only fetches public HTML — so there is no
  shared quota or shared key to contaminate.)
- Crawl volume explodes unbounded in one run.
- A YouTube markup change breaks parsing silently, with no visibility
  that the source has gone dark.
- Any form of active evasion (proxy rotation, CAPTCHA solving, retrying
  through a block) creeps in — decision 0004 explicitly excluded this.

## Constraints (carried from decision 0004 and this conversation)

- Personal/MVP scope only; must be re-reviewed before any public SaaS.
- Low frequency, sequential, gentle — not parallel/bursty.
- No proxy rotation, no CAPTCHA bypass, no retry-until-success against a
  block. A blocked/broken fetch is treated as a dead source for that
  attempt, not a target to route around.
- Seeds are restricted to videos already in `monitoringState` of
  `candidate` or `monitoring` (i.e., already passed
  `meetsViralCandidateThreshold` once) — not every discovered video.
- Country targeting: request the seed's own market (`gl`) and a matching
  language (`hl`) so the recommended sidebar leans toward that locale.
  For a multi-hop chain, every hop uses the **original** seed's market —
  not each hop's own channel country — so a chain started from a US
  candidate keeps requesting `gl=US` all the way down, regardless of
  where later-generation videos' channels are actually based.
- New videos found via scraping go through the same enrichment + scoring
  path as any other discovered video (same upsert, same `VideoScore`
  computation, same lifecycle state machine) — not a separate code path.

## Decided (the builder's calls, stated so they can be reviewed)

- **Where it lives:** new worker processor,
  `apps/worker/src/processors/recommended-scrape.ts`, run by a new
  periodic scheduler entry alongside the existing ones in
  `apps/worker/src/schedulers/index.ts` — not triggered directly off the
  `monitoringState` transition event, to keep it decoupled and easy to
  pause independently of scoring.
- **Schema change:** add `Video.recommendedScrapedAt DateTime?` (nullable,
  migration required) — marks "this video has already been used/attempted
  as a scrape seed," set after an attempt regardless of success, so a
  seed is never re-scraped or retried every run. Mirrors the existing
  `lastSnapshotAt`/`lastEnrichedAt` pattern already on `Video`.
  - Everything else needed is already schema-compatible with no
    migration: `DiscoveryEvent.source` is free-text `VarChar(40)` (new
    value `"recommended_scrape"`), `DiscoveryEvent.sourceRank` already
    exists (sidebar position), `DiscoveryEvent.sourcePayload` is `Json?`
    (stores `{ seedVideoId, rootSeedVideoId, gl, hl }` lineage).
- **Seed selection per run:** `monitoringState IN ('candidate',
  'monitoring') AND recommendedScrapedAt IS NULL`, capped at 20
  seeds/run, oldest-candidate-first. The `gl`/`hl` to use for each seed is
  resolved from its own discovery record: if it has a keyword-search-origin
  `DiscoveryEvent.marketId`, use that market's code/language (first
  generation); if it was itself found via `recommended_scrape`, reuse the
  `gl`/`hl` already stored in that event's `sourcePayload` verbatim (later
  generations) — so the whole chain keeps requesting the original seed's
  market, never a later hop's own channel country.
- **Schedule:** every 6 hours — a starting default, not calibrated.
- **Fetch:** plain HTTP GET to
  `https://www.youtube.com/watch?v=<id>&gl=<marketCode>&hl=<lang>` with a
  realistic desktop browser `User-Agent`; requests within a batch run
  sequentially with a 3–5s delay between them (gentleness, not evasion).
- **Parse:** regex-extract the inline `var ytInitialData = {...};` JSON
  blob from the HTML response, then walk its "watch next" / secondary
  results renderer to collect recommended video IDs in sidebar order.
- **New video handling, dedup:** YouTube's recommended sidebar is mostly
  already-popular/already-known videos, not just fresh niche adjacents.
  Following the `channel-video-discovery.ts` precedent (which diffs
  against `listKnownYoutubeVideoIds` rather than enqueueing
  unconditionally like `discovery-search.ts` does): for every scraped
  video id, check against already-known `Video` rows first. For a truly
  new id, create the `Video` stub, write a `DiscoveryEvent` row
  (`source: "recommended_scrape"`, `sourceRank` = sidebar position,
  `sourcePayload = { seedVideoId, rootSeedVideoId, gl, hl }`, where `gl`/
  `hl` are the **root** seed's market/language — unchanged through the
  whole chain, not recomputed from this video's own channel), and
  enqueue the same enrichment/scoring job the keyword-search path
  enqueues. For an already-known id, still
  write the `DiscoveryEvent` row (cheap, no quota — it records the
  recommendation-graph edge for later analysis) but do **not** re-enqueue
  enrichment; the existing snapshot/monitoring cycle already keeps it
  current. This keeps the quota this path indirectly consumes (via
  enrichment of genuinely new videos) from being spent re-touching videos
  the system already has.
- **Recursion:** no explicit recursive call or sub-queue. The periodic
  scheduler simply re-scans for `recommendedScrapedAt IS NULL` candidates
  every run; once a newly-scraped video clears the enrichment pipeline
  and `meetsViralCandidateThreshold`, it naturally appears as a seed in a
  later run. This reuses existing infrastructure instead of a bespoke
  crawl queue.
- **Failure handling:** on non-200 response, a detected consent-wall
  redirect, or a parse failure — log a warning with the video id and
  reason, still set `recommendedScrapedAt = now()` (so it isn't retried
  every run), and move to the next seed. Soft circuit breaker: if more
  than half of a batch fails, stop the rest of that run's batch early and
  let the next scheduled run try fresh — avoids hammering during a wider
  block or outage.
- **Silent-degradation detection:** a markup change can make extraction
  return zero recommendations without throwing — indistinguishable, per
  seed, from "this video legitimately has no sidebar recommendations," so
  it wouldn't trip the failure-based circuit breaker above. To catch this
  class of breakage, track the rolling average recommendations-extracted-
  per-seed across the last N runs and log a warning (candidate for a
  future alert) if it drops near zero — this is the same anti-goal the
  doc already calls out ("a markup change breaks parsing silently"), so
  it needs its own signal, not just the per-request failure counter.

## What's left to whoever implements this

- Exact current JSON path/renderer name inside `ytInitialData` for the
  recommended-videos list — YouTube's actual structure must be checked
  against a real fetched page during implementation; it isn't guessed
  here.
- Exact `User-Agent` string / header set to send.
- Whether to opportunistically read channel metadata already present in
  the scraped sidebar payload (saves an enrichment call) versus always
  re-fetching it fresh through the normal channel-enrichment path — a
  minor optimization, not a behavior change either way.
- Final tuning of batch size (20), delay (3–5s), and schedule (6h) once
  there's real signal on block rates — same "first-cut constant" caveat
  as the thresholds in [[0003-niche-breakout-signal]].
