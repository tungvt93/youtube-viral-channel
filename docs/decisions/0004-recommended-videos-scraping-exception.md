# 0004 Recommended-Videos Scraping Exception (PRD §20.2 Amendment)

Date: 2026-11-11

## Status

Accepted

## Context

User's real discovery goal is finding niche/small channels going viral
shortly after upload, by country — not just surfacing videos already on
official charts/search. The external technical note the user referenced
(`t_i_li_u_k_thu_t_h_th_ng_t_m_video_k_nh_ng_ch_viral_tr_n_youtube.md`,
step 3) proposes seeding from a known video and expanding through YouTube's
"recommended videos" sidebar by parsing `ytInitialData` out of the rendered
watch-page HTML.

There is no compliant API substitute for this: YouTube Data API v3's
`search.list` dropped `relatedToVideoId` years ago, and no replacement
parameter exists. Official lists (`videos.list(chart=mostPopular)`,
keyword `search.list`) only return already-popular or keyword-matched
content; they do not walk the recommendation graph the user actually wants.

The user confirmed (explicitly, after being shown the conflict) that this —
not the `mostPopular` regional chart — is the approach they consider
worth building, and separately confirmed they accept amending the policy
that currently blocks it.

Standing policy, PRD §20.2 (before this decision):

> Không dùng scraping để thay thế API khi điều đó vi phạm điều khoản.
> Không vượt rate/quota hoặc né giới hạn kỹ thuật.

This is a compliance-risk decision, not an implementation detail —
per `AGENTS.md` ("identify repository authority... stop before edits if
materially different choices remain open"), it required an explicit
product-owner call before any code or further planning.

## Decision

Amend PRD §20.2 to carve out a narrow, named exception (see the PRD diff)
for recommended-video expansion from a seed video, scoped as follows:

- Applies only to the personal/MVP use case this PRD describes — not
  carried forward automatically if this ever becomes a public SaaS
  (§20.2's existing "review lại policy trước khi public SaaS" line now
  explicitly covers re-evaluating this exception).
- Scraping stays low-frequency/best-effort: this is not a bulk crawl, it
  is incremental seed→recommendation expansion for discovery, not a
  replacement for the official API's quota-metered calls.
- Kept operationally separate from the main YouTube Data API key/project,
  so a block/ban from this unofficial path cannot take down official
  ingestion.
- No proxy rotation or other active evasion of YouTube's anti-bot
  measures (see Alternatives Considered) — if blocked, back off and treat
  it as a broken/unavailable source, not something to route around.

This decision authorizes the *policy change only*. The scraping worker's
actual design (fetch strategy, parsing, scheduling, failure handling) is
not specified here and still needs its own brainstorm/plan before any code
is written, per the standing brainstorming HARD-GATE.

## Alternatives Considered

1. **Do nothing; stay API-only.** Rejected by the user — official lists
   (regional chart, keyword search) don't reach the recommendation-graph
   expansion that is the actual goal; confirmed explicitly via "2" after
   being offered this as the compliant option.
2. **Proxy rotation to dodge HTTP 429/CAPTCHA** (as the source document
   recommends). Rejected: this is active evasion of YouTube's technical
   limits, a materially higher ToS/ban-risk tier than passively fetching a
   public page at low frequency, and not necessary for the user's stated
   goal (incremental seed expansion, not bulk harvesting).
3. **Scope the exception globally (any scraping, anywhere)** instead of
   narrowly to recommended-video expansion. Rejected: keeps the blocked
   general rule intact for everything else (e.g. no scraping search results
   or channel pages as a quota workaround), minimizing how much policy
   surface is weakened.

## Consequences

Positive:

- Unblocks the user's actual priority (niche-channel discovery via
  recommendation expansion) which has no compliant substitute.
- Narrow scope + operational isolation keeps the blast radius of a
  block/ban limited to this one unofficial path.

Tradeoffs/risks (accepted, not mitigated to zero):

- Violates YouTube's Terms of Service/Developer Policies in the strict
  sense that §20.2 otherwise holds the line on; this is a conscious,
  documented risk acceptance, not a compliance guarantee.
- `ytInitialData` is an undocumented internal structure with no
  compatibility contract — Google can change it without notice and break
  parsing silently.
- Possible IP or Google-account-level blocking independent of the official
  API key/quota system.
- Must be re-reviewed (and likely removed or re-licensed) before any public
  SaaS launch, per the existing PRD §20.2 pre-public-launch review line.

## Follow-Up

- Before writing the scraping worker itself, run a brainstorming pass on
  its concrete design (fetch/parse strategy, scheduling cadence, dedupe
  against existing `Video`/`Channel` records, failure/backoff behavior
  when the page structure breaks or a block is hit) — nothing gets built
  from this decision alone.
- Re-review this exception specifically (not just the general §20.2
  pre-SaaS review) the first time this project moves toward a public or
  multi-tenant deployment.
