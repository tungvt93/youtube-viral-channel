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
