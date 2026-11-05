export function packageMarker(): string {
  return "@yvi/shared";
}

export { discoveryIdempotencyKey, formatDateBucket, videoEnrichIdempotencyKey } from "./idempotency";
export type { DiscoveryIdempotencyKeyParams, VideoEnrichIdempotencyKeyParams } from "./idempotency";
export { evaluateQuotaGuard } from "./quota-guard";
export type { QuotaGuardDecision, QuotaGuardInput } from "./quota-guard";
export { QUEUE_NAMES } from "./queues";
export type {
  ChannelEnrichmentJobData,
  DiscoveryJobData,
  QueueName,
  VideoEnrichmentCandidate,
  VideoEnrichmentJobData,
} from "./queues";
