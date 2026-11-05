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
  ChannelScoringJobData,
  ChannelVideoDiscoveryJobData,
  DiscoveryJobData,
  QueueName,
  TopicNormalizationJobData,
  TopicTrendAggregationJobData,
  VideoClassificationJobData,
  VideoEnrichmentCandidate,
  VideoEnrichmentJobData,
  VideoMonitoringJobData,
  VideoScoringJobData,
} from "./queues";
export { computeNextSnapshotDueAt, nextMonitoringState } from "./monitoring";
export type { MonitoringState, SnapshotOutcome } from "./monitoring";
