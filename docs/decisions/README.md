# Decisions

Decision records preserve lasting product, architecture, data ownership,
security, compatibility, and validation choices that future work must inherit.

Use `docs/templates/decision.md`. Task-local implementation choices remain in
the active execution plan and do not require a separate decision.

An installed consumer begins with no fabricated decisions. Add local decision
documents here as real choices are accepted, then index them in this file.

## Index

- [0001 MVP Scope Decisions (PRD Open Questions)](0001-mvp-scope-decisions.md) — personal use, 4 markets (US/UK/DE/FR), Shorts priority, Gemini-only AI, in-app-only alerts, URL-only thumbnails, no snapshot retention cutoff, default 10k/day quota assumption.
- [0002 Do Not Vendor outlier-finder](0002-no-vendor-outlier-finder.md) — no license + architecture/security mismatch; reimplement its Shorts-detection heuristic and outlier-fallback formula ourselves instead of cloning.
- [0003 Niche Breakout Signal (VSR-lite)](0003-niche-breakout-signal.md) — absolute views/subscriber ratio for 1k–50k-subscriber channels, surfaced as its own alert + score bonus, separate from the cohort-relative outlier percentile.
- [0004 Recommended-Videos Scraping Exception (PRD §20.2 Amendment)](0004-recommended-videos-scraping-exception.md) — narrow, named exception to the no-scraping policy for seed→recommended-video expansion (no compliant API substitute since `relatedToVideoId` was deprecated); policy change only, no evasion, isolated from the main API key, implementation still needs its own brainstorm/plan.
- [0005 On-Demand Keyword-Search Discovery (PRD §6.2/§6.3/§16.6 Amendment)](0005-on-demand-keyword-search-discovery.md) — drop always-on discovery scheduling (regional viral-chart poll, periodic admin keyword search, 6h recommended-scrape tick) in favor of a single on-demand "search this keyword" action that runs search + recommended-sidebar expansion as one background job, notifying the dashboard when done.
