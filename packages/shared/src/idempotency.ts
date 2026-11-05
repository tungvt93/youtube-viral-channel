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

/** `discovery:{strategy}:{market}:{query}:{date_bucket}` per PRD §17.3. */
export function discoveryIdempotencyKey(params: DiscoveryIdempotencyKeyParams): string {
  return `discovery:${params.strategy}:${params.marketCode}:${params.query}:${params.dateBucket}`;
}

export interface VideoEnrichIdempotencyKeyParams {
  videoId: string;
  metadataVersion: string;
}

/** `video-enrich:{video_id}:{metadata_version}` per PRD §17.3. */
export function videoEnrichIdempotencyKey(params: VideoEnrichIdempotencyKeyParams): string {
  return `video-enrich:${params.videoId}:${params.metadataVersion}`;
}
