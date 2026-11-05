import { Queue } from "bullmq";
import type IORedis from "ioredis";
import { QUEUE_NAMES } from "@yvi/shared";

export function packageMarker(): string {
  return "@yvi/worker/queues";
}

export interface Queues {
  discoveryRegional: Queue;
  discoverySearch: Queue;
  videoEnrichment: Queue;
  channelEnrichment: Queue;
  videoMonitoring: Queue;
}

/** One Queue instance per queue name, sharing a single (non-blocking) Redis connection. */
export function createQueues(connection: IORedis): Queues {
  return {
    discoveryRegional: new Queue(QUEUE_NAMES.discoveryRegional, { connection }),
    discoverySearch: new Queue(QUEUE_NAMES.discoverySearch, { connection }),
    videoEnrichment: new Queue(QUEUE_NAMES.videoEnrichment, { connection }),
    channelEnrichment: new Queue(QUEUE_NAMES.channelEnrichment, { connection }),
    videoMonitoring: new Queue(QUEUE_NAMES.videoMonitoring, { connection }),
  };
}

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
}
