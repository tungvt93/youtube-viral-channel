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
