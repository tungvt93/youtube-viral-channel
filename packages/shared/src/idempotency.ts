/** UTC calendar-day bucket (e.g. "2026-11-05"), used as the idempotency date_bucket (PRD §17.3). */
export function formatDateBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DiscoveryIdempotencyKeyParams {
  strategy: string;
  marketCode: string;
  query: string;
  dateBucket: string;
}

/**
 * Semantically `discovery:{strategy}:{market}:{query}:{date_bucket}` per PRD
 * §17.3, but underscore-delimited rather than colon-delimited: this key is
 * also used directly as BullMQ's `jobId` (so a same-day retry is a natural
 * no-op), and BullMQ rejects any custom jobId containing `:` outside its own
 * internal `repeat:<id>:<timestamp>` format (see plan Decisions, 2026-11-05).
 */
export function discoveryIdempotencyKey(params: DiscoveryIdempotencyKeyParams): string {
  return `discovery_${params.strategy}_${params.marketCode}_${params.query}_${params.dateBucket}`;
}

export interface VideoEnrichIdempotencyKeyParams {
  videoId: string;
  metadataVersion: string;
}

/** Semantically `video-enrich:{video_id}:{metadata_version}` per PRD §17.3 — see `discoveryIdempotencyKey` for why `:` is avoided. */
export function videoEnrichIdempotencyKey(params: VideoEnrichIdempotencyKeyParams): string {
  return `video-enrich_${params.videoId}_${params.metadataVersion}`;
}
