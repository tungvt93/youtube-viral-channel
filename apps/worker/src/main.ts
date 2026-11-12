import { Worker } from "bullmq";
import { prisma } from "@yvi/db";
import { YouTubeClient } from "@yvi/youtube-client";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@yvi/ai-client";
import { QUEUE_NAMES } from "@yvi/shared";
import { logger } from "./common/logger";
import { createRedisConnection } from "./redis";
import { startHealthServer } from "./health-server";
import { createQueues } from "./queues/index";
import {
  createChannelEnrichmentProcessor,
  createChannelScoringProcessor,
  createChannelVideoDiscoveryProcessor,
  createDiscoveryRegionalProcessor,
  createDiscoverySearchProcessor,
  createKeywordSearchProcessor,
  createRecommendedScrapeProcessor,
  createSystemAlertsProcessor,
  createTopicNormalizationProcessor,
  createTopicTrendAggregationProcessor,
  createVideoClassificationProcessor,
  createVideoEnrichmentProcessor,
  createVideoMonitoringProcessor,
  createVideoScoringProcessor,
  type ProcessorDeps,
} from "./processors/index";
import {
  registerChannelScoringScheduler,
  registerChannelVideoDiscoveryScheduler,
  registerSystemAlertsScheduler,
  registerTopicNormalizationScheduler,
  registerTopicTrendAggregationScheduler,
  registerVideoClassificationScheduler,
  registerVideoMonitoringScheduler,
  registerVideoScoringScheduler,
} from "./schedulers/index";

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  logger.warn("YOUTUBE_API_KEY is not set — discovery/enrichment jobs will fail until it is configured");
}

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  logger.warn("GEMINI_API_KEY is not set — video-classification/topic-normalization jobs will fail until it is configured");
}
const aiModel = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

const connection = createRedisConnection();
const queues = createQueues(connection);
const youtube = new YouTubeClient({ apiKey: apiKey ?? "" });
const ai = new GeminiProvider({ apiKey: geminiApiKey ?? "", model: aiModel });

const deps: ProcessorDeps = { db: prisma, youtube, ai, aiModel, queues, logger };

const workers = [
  new Worker(QUEUE_NAMES.discoveryRegional, createDiscoveryRegionalProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.discoverySearch, createDiscoverySearchProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoEnrichment, createVideoEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelEnrichment, createChannelEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoMonitoring, createVideoMonitoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoScoring, createVideoScoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelVideoDiscovery, createChannelVideoDiscoveryProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelScoring, createChannelScoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoClassification, createVideoClassificationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.topicNormalization, createTopicNormalizationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.topicTrendAggregation, createTopicTrendAggregationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.recommendedScrape, createRecommendedScrapeProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.systemAlerts, createSystemAlertsProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.keywordSearch, createKeywordSearchProcessor(deps), { connection }),
];

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, status: "error" }, error.message);
  });
}

const port = process.env.WORKER_HEALTH_PORT ? Number(process.env.WORKER_HEALTH_PORT) : 3002;
startHealthServer(connection, port);

registerVideoMonitoringScheduler(queues)
  .then(() => logger.info("registered video-monitoring scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register video-monitoring scheduler: ${String(error)}`));

registerVideoScoringScheduler(queues)
  .then(() => logger.info("registered video-scoring scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register video-scoring scheduler: ${String(error)}`));

registerChannelVideoDiscoveryScheduler(queues)
  .then(() => logger.info("registered channel-video-discovery scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register channel-video-discovery scheduler: ${String(error)}`));

registerChannelScoringScheduler(queues)
  .then(() => logger.info("registered channel-scoring scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register channel-scoring scheduler: ${String(error)}`));

registerVideoClassificationScheduler(queues)
  .then(() => logger.info("registered video-classification scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register video-classification scheduler: ${String(error)}`));

registerTopicNormalizationScheduler(queues)
  .then(() => logger.info("registered topic-normalization scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register topic-normalization scheduler: ${String(error)}`));

registerTopicTrendAggregationScheduler(queues)
  .then(() => logger.info("registered topic-trend-aggregation scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register topic-trend-aggregation scheduler: ${String(error)}`));

registerSystemAlertsScheduler(queues)
  .then(() => logger.info("registered system-alerts scheduler"))
  .catch((error) => logger.error({ status: "error" }, `failed to register system-alerts scheduler: ${String(error)}`));

logger.info(
  "worker process started: discovery-regional, discovery-search, video-enrichment, channel-enrichment, video-monitoring, video-scoring, channel-video-discovery, channel-scoring, video-classification, topic-normalization, topic-trend-aggregation, recommended-scrape, system-alerts, keyword-search",
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
