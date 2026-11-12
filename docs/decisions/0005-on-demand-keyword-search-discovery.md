# 0005 On-Demand Keyword-Search Discovery (PRD §6.2/§6.3/§16.6 Amendment)

Date: 2026-11-12

## Status

Accepted

## Context

Discovery today runs on two always-on BullMQ schedulers, both configured
through the admin "Discovery Sources" page (`apps/web/.../discovery`) and
backed by the `DiscoveryQuery` table:

- **Strategy 1 — Regional Popularity Seed (PRD §6.2):** `videos.list
  (chart=mostPopular)` per enabled market, on a periodic schedule
  (1-2x/day). This is the "lấy video đang viral" polling the user no
  longer wants.
- **Strategy 2 — Recent Upload Search (PRD §6.3):** `search.list` against
  admin-configured keyword queries, also on its own periodic
  `frequencyMinutes` schedule.

Separately, a standalone 6-hour scheduler tick
(`recommended-scrape-tick`, [[0004-recommended-videos-scraping-exception]])
scans the whole video pool for `monitoringState IN ('high_signal',
'cooling')` videos not yet scraped, and walks their YouTube watch-page
"recommended videos" sidebar to expand discovery. (Decision 0004's own
text describes the gate as `candidate`/`monitoring`; the code that
shipped from its design doc actually gates on `high_signal`/`cooling` —
a pre-existing drift between that decision's prose and the implementation,
noted here for context only, not something this decision changes.)

The user's actual workflow is: type a keyword, see what's out there
around it right now, and be done — not maintain an always-on background
crawl. They confirmed (after walking through the current architecture)
that they want discovery to run **only** when they submit a keyword, with
the recommended-video expansion for that search's own results bundled
into the same on-demand action, surfaced as a background job that
notifies the dashboard when done.

Per `AGENTS.md` ("identify repository authority for each new externally
observable policy... stop before edits if materially different choices
remain open"), this is a product/architecture decision, not an
implementation detail, since it removes always-on behavior the current
PRD sections document as the discovery mechanism.

## Decision

1. **Regional Popularity Seed (§6.2):** keep the `discoveryRegional`
   queue/processor code as-is, but stop registering its scheduler at
   worker boot. It becomes dormant, unreachable from any UI (the page
   that exposed it is removed per point 3) — not deleted, so it can be
   revived later with a small code change if ever needed again.
2. **Recommended-scrape periodic tick:** remove the standalone 6-hour
   scheduler entirely. Recommended-video expansion no longer runs as an
   independent background process; it only runs as the second half of an
   on-demand keyword-search job, seeded directly from that search's own
   results — **not** gated behind `monitoringState` reaching
   `high_signal`/`cooling` the way the periodic tick was. Seeding now
   comes from a small, deliberate, user-initiated action instead of an
   unbounded periodic scan of the whole pool, so the old lifecycle gate's
   purpose (bounding an otherwise-unbounded background scan) no longer
   applies the same way.
3. **Recent Upload Search (§6.3) + Discovery Sources page (§16.6):** the
   admin-configured, periodically-scheduled `DiscoveryQuery`-backed search
   is replaced by a new on-demand screen: the user types one keyword
   (plus market/language), submits, and a single background job runs
   once — no persisted recurring schedule for search remains. The
   Discovery Sources admin page is fully replaced (not kept alongside).
4. Recommended expansion stays one hop deep per search (found videos →
   their own recommended sidebar), matching the prior periodic tick's own
   per-run depth — just invoked on demand instead of on a clock. Reaching
   a second hop requires another user search that happens to surface
   those videos, not automatic continuation.
5. Only the *trigger and scheduling* policy changes. The underlying
   `search.list` call shape, the watch-page fetch/parse logic, the
   gentle-scraping behavior (sequential, randomized delay, circuit
   breaker, no evasion) from decision 0004 are all reused unchanged.

Concrete design (schema, queues, API, screen) is tracked separately in
`docs/superpowers/specs/2026-11-12-on-demand-keyword-discovery-design.md` —
this decision authorizes the policy change only, per the same split
decision 0004 used.

## Alternatives Considered

1. **Keep the periodic schedulers running alongside the new on-demand
   screen.** Rejected — the user explicitly wants discovery to run only
   when they submit a keyword, not continuously in the background.
2. **Keep decision 0004's `monitoringState` seed-eligibility gate intact**
   and only add a manual "run now" trigger for the existing periodic
   recommended-scrape job. Rejected — a freshly-found video takes time
   (through enrichment → monitoring → scoring) to reach `high_signal`/
   `cooling`, so most keyword searches would find zero recommended videos
   immediately; this doesn't satisfy "find videos → scrape recommended
   around them" as one pass.
3. **Delete the `most_popular` strategy's code entirely** instead of just
   disabling its scheduler. Rejected by the user in favor of keeping the
   code dormant for possible future reuse.
4. **Keep the Discovery Sources admin page alongside the new screen** (for
   some other admin purpose). Rejected by the user in favor of full
   replacement — one screen for discovery, not two.

## Consequences

Positive:

- Matches the actual usage pattern (a personal, on-demand research tool)
  instead of continuously spending scrape/API budget on an always-on
  background system the user isn't watching.
- Simpler mental model: one screen, one action, one completion notice.
- Recommended-scrape volume is now bounded by how often the user searches
  rather than an independent clock — if anything, more conservative than
  before relative to decision 0004's "low-frequency/best-effort, not a
  bulk crawl" intent.

Tradeoffs (accepted):

- Recommended-video expansion now only happens one hop deep, only for a
  given search's own results. Videos that would have eventually surfaced
  through the old always-on `high_signal`/`cooling` crawl no longer get
  recommended-scraped at all unless a future keyword search happens to
  surface them directly — niche-discovery reach may shrink versus the
  always-on background crawl.
- `most_popular`'s processor/queue code, the `DiscoveryQuery` table and
  its admin-page callers, and the `monitoringState`-gated seed-selection
  query all become dead/unreachable code paths once their scheduler/UI is
  removed. Left in place deliberately (narrow blast radius, no
  destructive migration) rather than deleted — should be revisited if
  never revived.
- No more passive accumulation of new candidates while the user is away;
  discovery entirely depends on the user remembering to search.

## Follow-Up

- Implementation design: `docs/superpowers/specs/2026-11-12-on-demand-keyword-discovery-design.md`.
- Nothing gets built from this decision alone — per the standing
  brainstorming HARD-GATE, the design doc still needs a builder check and
  explicit user approval before implementation starts.
- Re-review if this project ever needs concurrent multi-user search
  (today: single-user MVP per PRD §3.3, so no per-user job isolation is
  designed here).
