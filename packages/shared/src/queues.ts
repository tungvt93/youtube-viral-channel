/** BullMQ queue names (PRD §17.1). */
export const QUEUE_NAMES = {
  discoveryRegional: "discovery-regional",
  discoverySearch: "discovery-search",
  videoEnrichment: "video-enrichment",
  channelEnrichment: "channel-enrichment",
  videoMonitoring: "video-monitoring",
  videoScoring: "video-scoring",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Job payload for both discovery-regional and discovery-search: both resolve
 * params from the DiscoveryQuery row by id. No `jobRunId` here — unlike
 * video/channel-enrichment (enqueued programmatically, where the caller can
 * pre-create the JobRun), discovery jobs are also produced by BullMQ's
 * repeatable JobScheduler from a static data template, so the processor
 * creates its own JobRun keyed by the BullMQ job's own id (PRD §17.3 — for a
 * manually-triggered run, `apps/api` sets that job id to the discovery
 * idempotency key, making re-triggers within the same day-bucket a no-op).
 */
export interface DiscoveryJobData {
  discoveryQueryId: string;
}

export interface VideoEnrichmentCandidate {
  videoId: string;
  sourceRank: number | null;
}

/**
 * One job enriches an entire discovery-run page (up to 50 ids) in a single
 * batched `videos.list` call, instead of one job per video, so the quota
 * saving from batching (1 unit for up to 50 ids) is actually realized.
 */
export interface VideoEnrichmentJobData {
  jobRunId: string;
  marketId: string;
  discoveryQueryId: string | null;
  source: string;
  discoveredAt: string;
  items: VideoEnrichmentCandidate[];
}

export interface ChannelEnrichmentJobData {
  youtubeChannelIds: string[];
  jobRunId: string;
}

/**
 * Empty on purpose: the monitoring-tick scheduler carries no per-tick
 * parameters (unlike discovery's per-query template) — the processor
 * re-selects whichever videos are due from the database on every tick.
 */
export type VideoMonitoringJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoMonitoringJobData`: the
 * scoring-tick scheduler carries no per-tick parameters — the processor
 * re-selects whichever videos are eligible from the database on every tick.
 */
export type VideoScoringJobData = Record<string, never>;
