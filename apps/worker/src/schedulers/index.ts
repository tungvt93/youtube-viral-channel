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
