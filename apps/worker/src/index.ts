/**
 * Library entry point (distinct from `main.ts`, the process entry point) —
 * exists only so `apps/e2e` can drive the real processors in-process
 * against a real Postgres, with a fake `YouTubeClient`, instead of going
 * through BullMQ (plan `docs/plans/active/phase-7-hardening.md`, Approach
 * step 5).
 */
export type { ProcessorDeps } from "./processors/deps";
export { createChannelEnrichmentProcessor, createKeywordSearchProcessor } from "./processors/index";
export type { Queues } from "./queues/index";
