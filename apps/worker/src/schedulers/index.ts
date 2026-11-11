import { listEnabledDiscoveryQueriesWithMarket, type PrismaClient } from "@yvi/db";
import { QUEUE_NAMES } from "@yvi/shared";
import type { Queues } from "../queues/index";

export function packageMarker(): string {
  return "@yvi/worker/schedulers";
}

/**
 * Registers one BullMQ repeatable JobScheduler per enabled DiscoveryQuery,
 * keyed by its id (idempotent: re-running this on every worker boot updates
 * rather than duplicates each scheduler). Single `apps/worker` instance for
 * MVP, no leader election (plan Decisions, 2026-11-05).
 */
export async function registerDiscoverySchedulers(db: PrismaClient, queues: Queues): Promise<number> {
  const discoveryQueries = await listEnabledDiscoveryQueriesWithMarket(db);

  for (const discoveryQuery of discoveryQueries) {
    const queue = discoveryQuery.strategy === "most_popular" ? queues.discoveryRegional : queues.discoverySearch;
    const queueName = discoveryQuery.strategy === "most_popular" ? QUEUE_NAMES.discoveryRegional : QUEUE_NAMES.discoverySearch;

    await queue.upsertJobScheduler(
      discoveryQuery.id,
      { every: discoveryQuery.frequencyMinutes * 60 * 1000 },
      {
        name: queueName,
        data: { discoveryQueryId: discoveryQuery.id },
      },
    );
  }

  return discoveryQueries.length;
}

/** Fixed id for the single video-monitoring tick (see plan Decisions, 2026-11-05: one static, colon-free id, no per-item fan-out). */
export const VIDEO_MONITORING_SCHEDULER_ID = "video-monitoring-tick";

/** How often the tick runs; each tick re-selects whichever videos are actually due (PRD §7.3's own cadence gates which ones that is). */
const VIDEO_MONITORING_TICK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Registers the single repeatable video-monitoring tick (idempotent, same
 * as `registerDiscoverySchedulers`). Deliberately one static scheduler id
 * with no further `:`-composed BullMQ ids downstream — Phase 1's colon-
 * jobId bug came from composing ids from a parent job's id, and this tick
 * enqueues no fan-out job at all (see plan Risks And Recovery).
 */
export async function registerVideoMonitoringScheduler(queues: Queues): Promise<void> {
  await queues.videoMonitoring.upsertJobScheduler(
    VIDEO_MONITORING_SCHEDULER_ID,
    { every: VIDEO_MONITORING_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.videoMonitoring, data: {} },
  );
}

/** Fixed id for the single video-scoring tick — same single-static-id pattern as `VIDEO_MONITORING_SCHEDULER_ID` (plan Decisions). */
export const VIDEO_SCORING_SCHEDULER_ID = "video-scoring-tick";

/**
 * Decoupled from the monitoring tick's own cadence (plan Decisions: a
 * scoring tick re-selects whichever videos are eligible, rather than being
 * chained off a snapshot insert) — runs independently every 15 minutes.
 */
const VIDEO_SCORING_TICK_INTERVAL_MS = 15 * 60 * 1000;

/** Registers the single repeatable video-scoring tick (idempotent, same as `registerVideoMonitoringScheduler`). */
export async function registerVideoScoringScheduler(queues: Queues): Promise<void> {
  await queues.videoScoring.upsertJobScheduler(
    VIDEO_SCORING_SCHEDULER_ID,
    { every: VIDEO_SCORING_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.videoScoring, data: {} },
  );
}

/** Fixed id for the single channel-video-discovery tick — same single-static-id pattern as `VIDEO_MONITORING_SCHEDULER_ID` (plan Decisions). */
export const CHANNEL_VIDEO_DISCOVERY_SCHEDULER_ID = "channel-video-discovery-tick";

/** PRD §9.5: an uploads-playlist poll doesn't need video-monitoring's 15-minute granularity — channels don't upload that often. */
const CHANNEL_VIDEO_DISCOVERY_TICK_INTERVAL_MS = 60 * 60 * 1000;

/** Registers the single repeatable channel-video-discovery tick (idempotent, same as `registerVideoMonitoringScheduler`). */
export async function registerChannelVideoDiscoveryScheduler(queues: Queues): Promise<void> {
  await queues.channelVideoDiscovery.upsertJobScheduler(
    CHANNEL_VIDEO_DISCOVERY_SCHEDULER_ID,
    { every: CHANNEL_VIDEO_DISCOVERY_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.channelVideoDiscovery, data: {} },
  );
}

/** Fixed id for the single channel-scoring tick — same single-static-id pattern as `VIDEO_SCORING_SCHEDULER_ID` (plan Decisions). */
export const CHANNEL_SCORING_SCHEDULER_ID = "channel-scoring-tick";

/** Decoupled from the discovery tick's own cadence, same reasoning as `VIDEO_SCORING_TICK_INTERVAL_MS` (plan Decisions). */
const CHANNEL_SCORING_TICK_INTERVAL_MS = 15 * 60 * 1000;

/** Registers the single repeatable channel-scoring tick (idempotent, same as `registerVideoScoringScheduler`). */
export async function registerChannelScoringScheduler(queues: Queues): Promise<void> {
  await queues.channelScoring.upsertJobScheduler(
    CHANNEL_SCORING_SCHEDULER_ID,
    { every: CHANNEL_SCORING_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.channelScoring, data: {} },
  );
}

/** Fixed id for the single video-classification tick — same single-static-id pattern as `VIDEO_SCORING_SCHEDULER_ID` (plan Decisions). */
export const VIDEO_CLASSIFICATION_SCHEDULER_ID = "video-classification-tick";

/** Task-local: same 15-minute cadence as the other bounded-batch ticks (`VIDEO_SCORING_TICK_INTERVAL_MS`) — the tick's own `MAX_VIDEOS_PER_TICK` cap and AI-budget guard bound cost per run, not the interval. */
const VIDEO_CLASSIFICATION_TICK_INTERVAL_MS = 15 * 60 * 1000;

/** Registers the single repeatable video-classification tick (idempotent, same as `registerVideoScoringScheduler`). */
export async function registerVideoClassificationScheduler(queues: Queues): Promise<void> {
  await queues.videoClassification.upsertJobScheduler(
    VIDEO_CLASSIFICATION_SCHEDULER_ID,
    { every: VIDEO_CLASSIFICATION_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.videoClassification, data: {} },
  );
}

/** Fixed id for the single topic-normalization tick — same single-static-id pattern as `VIDEO_SCORING_SCHEDULER_ID` (plan Decisions). */
export const TOPIC_NORMALIZATION_SCHEDULER_ID = "topic-normalization-tick";

/** Task-local: plan calls this tick "lower frequency" than classification without naming a number — four hours, since candidate topics accumulate slowly and a batched normalization call is relatively expensive AI spend. */
const TOPIC_NORMALIZATION_TICK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Registers the single repeatable topic-normalization tick (idempotent, same as `registerVideoScoringScheduler`). */
export async function registerTopicNormalizationScheduler(queues: Queues): Promise<void> {
  await queues.topicNormalization.upsertJobScheduler(
    TOPIC_NORMALIZATION_SCHEDULER_ID,
    { every: TOPIC_NORMALIZATION_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.topicNormalization, data: {} },
  );
}

/** Fixed id for the single topic-trend-aggregation tick — same single-static-id pattern as `VIDEO_SCORING_SCHEDULER_ID` (plan Decisions). */
export const TOPIC_TREND_AGGREGATION_SCHEDULER_ID = "topic-trend-aggregation-tick";

/** PRD §10.5-driven plan Approach: daily, matching the tick's own trailing 7-day window. */
const TOPIC_TREND_AGGREGATION_TICK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Registers the single repeatable topic-trend-aggregation tick (idempotent, same as `registerVideoScoringScheduler`). */
export async function registerTopicTrendAggregationScheduler(queues: Queues): Promise<void> {
  await queues.topicTrendAggregation.upsertJobScheduler(
    TOPIC_TREND_AGGREGATION_SCHEDULER_ID,
    { every: TOPIC_TREND_AGGREGATION_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.topicTrendAggregation, data: {} },
  );
}

/** Fixed id for the single recommended-scrape tick — same single-static-id pattern as `VIDEO_SCORING_SCHEDULER_ID` (plan Decisions). */
export const RECOMMENDED_SCRAPE_SCHEDULER_ID = "recommended-scrape-tick";

const RECOMMENDED_SCRAPE_TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Registers the single repeatable recommended-scrape tick (idempotent, same as `registerVideoScoringScheduler`). */
export async function registerRecommendedScrapeScheduler(queues: Queues): Promise<void> {
  await queues.recommendedScrape.upsertJobScheduler(
    RECOMMENDED_SCRAPE_SCHEDULER_ID,
    { every: RECOMMENDED_SCRAPE_TICK_INTERVAL_MS },
    { name: QUEUE_NAMES.recommendedScrape, data: {} },
  );
}
