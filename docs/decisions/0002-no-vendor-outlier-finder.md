# 0002 Do Not Vendor github.com/ayema24/outlier-finder

Date: 2026-11-05

## Status

Accepted

## Context

User found `github.com/ayema24/outlier-finder`, a small public repo that
finds small-channel YouTube videos with unusually high views, and asked
whether to clone it as a base to build on.

Evaluation of the repo (via GitHub API metadata and its README, no local
clone made):

- **No LICENSE file** (`license: null` in repo metadata) — default "all
  rights reserved" applies. Public-on-GitHub only grants view/fork, not
  permission to vendor the code into another product without asking the
  author.
- **Architecture mismatch:** static no-build site (vanilla JS + HTML + CSS),
  no backend, no TypeScript, no database — all state (watchlist, trend
  history) lives in browser `localStorage`. YVI's accepted stack (PRD §14,
  [[0001-mvp-scope-decisions]]) is Node.js/TypeScript + NestJS + Next.js +
  PostgreSQL + Redis/BullMQ with server-side historical snapshots.
- **Security model directly conflicts with PRD §20.1:** the repo stores the
  YouTube API key in browser `localStorage` and calls `googleapis.com`
  straight from the client. PRD explicitly forbids ever exposing the API key
  to the frontend.
- Low activity signal: created 2026-09-28, last pushed 2026-09-29 (single-day
  burst), 2 stars, 4 forks — small, not a maintained reference implementation.

## Decision

Do not clone or vendor `outlier-finder` into this repository, and do not use
it as an architectural base. Treat its public README only as a source of
algorithm *ideas* to reimplement independently in our own TypeScript code
under our own stack and license — never copy its source files.

Concrete techniques worth reimplementing later (own words/own code, not
copied):

1. **Shorts detection heuristic** (useful because [[0001-mvp-scope-decisions]]
   chose "prioritize Shorts", and PRD §8.1/§15.3 define `format_classification`
   but no concrete detection algorithm):
   - Duration > 3 minutes → treat as long-form.
   - Duration ≤ 3 minutes → call `videos.list` with `part=player&maxHeight=<n>`
     (no extra quota cost) and check the returned embed's aspect ratio; a
     taller-than-wide embed indicates a Short.
   - If player shape is unavailable, fall back to a `#shorts` tag in
     title/description, then to the legacy "≤60 seconds" rule.
2. **Simple outlier fallback formula** `views / max(subscriber_count, 100)` —
   useful as a low-confidence fallback when a channel has too few historical
   videos for the median-baseline Channel Outlier calculation in PRD §8.1E/§9.3
   (PRD already allows a "peer baseline... or gắn confidence thấp" escape
   hatch; this gives a concrete fallback number instead of leaving it
   unspecified).

These are implementation details for Phase 1 (Shorts detection, part of video
enrichment) and Phase 3/4 (scoring fallback), not new product policy — they
should land as code + unit tests when those phases are implemented, not as
further decision records.

## Alternatives Considered

1. Clone and vendor the repo directly into the monorepo as a starting point —
   rejected: no license, wrong stack, conflicting security model.
2. Clone to a non-project scratch location purely to read the full source
   before deciding — rejected by the user; the published README already gave
   enough detail on the two techniques worth reusing as ideas.

## Consequences

Positive:

- Avoids shipping unlicensed third-party code and avoids importing a
  client-side-API-key architecture that PRD §20.1 forbids.
- Captures two concretely useful algorithm ideas (Shorts detection, outlier
  fallback) so they aren't rediscovered or lost.

Tradeoffs:

- We get no working code to start from; the Shorts detection and outlier
  fallback logic must be implemented and tested from scratch.

## Follow-Up

- When implementing video enrichment in Phase 1, implement the Shorts
  detection heuristic above as a pure function in `packages/scoring` (or the
  YouTube client package), with unit tests per PRD §23.1.
- When implementing Channel Outlier in Phase 3/4, add the
  `views / max(subscribers, 100)` fallback for channels with insufficient
  video history, flagged with low `data_confidence` per PRD §8.1E.
