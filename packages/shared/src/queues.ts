/** BullMQ queue names (PRD §17.1). */
export const QUEUE_NAMES = {
  discoveryRegional: "discovery-regional",
  discoverySearch: "discovery-search",
  videoEnrichment: "video-enrichment",
  channelEnrichment: "channel-enrichment",
  videoMonitoring: "video-monitoring",
  videoScoring: "video-scoring",
  channelVideoDiscovery: "channel-video-discovery",
  channelScoring: "channel-scoring",
  videoClassification: "video-classification",
  topicNormalization: "topic-normalization",
  topicTrendAggregation: "topic-trend-aggregation",
  recommendedScrape: "recommended-scrape",
  systemAlerts: "system-alerts",
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
  /** Null for channel-uploads-sourced items (PRD §9.5) — discovery isn't market-scoped there. */
  marketId: string | null;
  discoveryQueryId: string | null;
  source: string;
  discoveredAt: string;
  items: VideoEnrichmentCandidate[];
  /** Lineage metadata for `recommended_scrape`-sourced items, threaded verbatim into `createDiscoveryEvent`; absent/null for every other source. */
  sourcePayload?: Record<string, unknown> | null;
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

/**
 * Empty on purpose, same reasoning as `VideoMonitoringJobData`: the
 * channel-video-discovery tick re-selects whichever channels are due for an
 * uploads-playlist poll from the database on every tick.
 */
export type ChannelVideoDiscoveryJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoScoringJobData`: the
 * channel-scoring tick re-selects whichever channels are eligible from the
 * database on every tick.
 */
export type ChannelScoringJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoScoringJobData`: the
 * video-classification tick re-selects whichever videos have no successful
 * `ai_classification_runs` row yet from the database on every tick (PRD
 * §10/§19.3).
 */
export type VideoClassificationJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoScoringJobData`: the
 * topic-normalization tick re-selects whichever topics are currently
 * `status = "candidate"` from the database on every tick.
 */
export type TopicNormalizationJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoScoringJobData`: the
 * topic-trend-aggregation tick re-selects whichever (market, topic) pairs
 * have at least one observed video in the trailing window on every tick
 * (PRD §10.5).
 */
export type TopicTrendAggregationJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `ChannelVideoDiscoveryJobData`: the
 * recommended-scrape tick re-selects whichever videos are due for seed
 * selection from the database on every tick.
 */
export type RecommendedScrapeJobData = Record<string, never>;

/**
 * Empty on purpose, same reasoning as `VideoScoringJobData`: the
 * system-alerts tick re-reads today's quota usage and every queue's job
 * counts from scratch on every tick (plan Decisions, 2026-11-06).
 */
export type SystemAlertsJobData = Record<string, never>;
