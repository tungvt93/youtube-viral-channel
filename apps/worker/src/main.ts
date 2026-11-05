import { Worker } from "bullmq";
import { prisma } from "@yvi/db";
import { YouTubeClient } from "@yvi/youtube-client";
import { QUEUE_NAMES } from "@yvi/shared";
import { logger } from "./common/logger";
import { createRedisConnection } from "./redis";
import { startHealthServer } from "./health-server";
import { createQueues } from "./queues/index";
import {
  createChannelEnrichmentProcessor,
  createDiscoveryRegionalProcessor,
  createDiscoverySearchProcessor,
  createVideoEnrichmentProcessor,
  createVideoMonitoringProcessor,
  createVideoScoringProcessor,
  type ProcessorDeps,
} from "./processors/index";
import {
  registerDiscoverySchedulers,
  registerVideoMonitoringScheduler,
  registerVideoScoringScheduler,
} from "./schedulers/index";

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  logger.warn("YOUTUBE_API_KEY is not set — discovery/enrichment jobs will fail until it is configured");
}

const connection = createRedisConnection();
const queues = createQueues(connection);
const youtube = new YouTubeClient({ apiKey: apiKey ?? "" });

const deps: ProcessorDeps = { db: prisma, youtube, queues, logger };

const workers = [
  new Worker(QUEUE_NAMES.discoveryRegional, createDiscoveryRegionalProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.discoverySearch, createDiscoverySearchProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoEnrichment, createVideoEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelEnrichment, createChannelEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoMonitoring, createVideoMonitoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoScoring, createVideoScoringProcessor(deps), { connection }),
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, status: "error" }, error.message);
  });
}

const port = process.env.WORKER_HEALTH_PORT ? Number(process.env.WORKER_HEALTH_PORT) : 3002;
startHealthServer(connection, port);

registerDiscoverySchedulers(prisma, queues)
  .then((count) => logger.info({ count }, "registered discovery schedulers"))
  .catch((error) => logger.error({ status: "error" }, `failed to register discovery schedulers: ${String(error)}`));

registerVideoMonitoringScheduler(queues)
  .then(() => logger.info("registered video-monitoring scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register video-monitoring scheduler: ${String(error)}`));

registerVideoScoringScheduler(queues)
  .then(() => logger.info("registered video-scoring scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register video-scoring scheduler: ${String(error)}`));

logger.info(
  "worker process started: discovery-regional, discovery-search, video-enrichment, channel-enrichment, video-monitoring, video-scoring",
);

async function shutdown(): Promise<void> {
  logger.info("worker shutting down");
  await Promise.all(workers.map((worker) => worker.close()));
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
