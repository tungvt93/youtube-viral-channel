import { Worker } from "bullmq";
import { finishJobRun, finishKeywordSearch, getKeywordSearchById, prisma } from "@yvi/db";
import { YouTubeClient } from "@yvi/youtube-client";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@yvi/ai-client";
import { QUEUE_NAMES, type KeywordSearchJobData } from "@yvi/shared";
import { logger } from "./common/logger";
import { createRedisConnection } from "./redis";
import { startHealthServer } from "./health-server";
import { createQueues, type Queues } from "./queues/index";
import {
  createChannelEnrichmentProcessor,
  createChannelScoringProcessor,
  createChannelVideoDiscoveryProcessor,
  createKeywordSearchProcessor,
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

/**
 * Decision 0005 retired the always-on discovery and recommended-scrape ticks,
 * but `upsertJobScheduler` persisted their repeat state in Redis — dropping
 * the boot-time registration does not remove what earlier boots wrote there,
 * so a Redis that still carries them keeps producing iterations forever. No
 * worker consumes these three queues any more, so every scheduler found on
 * them is by definition retired and is removed by key without matching ids.
 * Idempotent (a no-op once drained) and never fatal — a failure only logs.
 */
const RETIRED_QUEUE_KEYS: (keyof Queues)[] = ["discoveryRegional", "discoverySearch", "recommendedScrape"];
const RETIRED_JOB_CLEAN_LIMIT = 10_000;

async function drainRetiredQueues(): Promise<void> {
  for (const key of RETIRED_QUEUE_KEYS) {
    const queue = queues[key];
    try {
      const schedulers = await queue.getJobSchedulers();
      for (const scheduler of schedulers) {
        await queue.removeJobScheduler(scheduler.key);
      }
      const delayed = await queue.clean(0, RETIRED_JOB_CLEAN_LIMIT, "delayed");
      const waiting = await queue.clean(0, RETIRED_JOB_CLEAN_LIMIT, "wait");
      if (schedulers.length + delayed.length + waiting.length > 0) {
        logger.info(
          { queue: queue.name },
          `drained retired queue: ${schedulers.length} scheduler(s), ${delayed.length} delayed and ${waiting.length} waiting job(s)`,
        );
      }
    } catch (error) {
      logger.error({ queue: queue.name, status: "error" }, `failed to drain retired queue ${queue.name}: ${String(error)}`);
    }
  }
}

void drainRetiredQueues();

const workers = [
  new Worker(QUEUE_NAMES.videoEnrichment, createVideoEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelEnrichment, createChannelEnrichmentProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoMonitoring, createVideoMonitoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoScoring, createVideoScoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelVideoDiscovery, createChannelVideoDiscoveryProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.channelScoring, createChannelScoringProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.videoClassification, createVideoClassificationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.topicNormalization, createTopicNormalizationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.topicTrendAggregation, createTopicTrendAggregationProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.systemAlerts, createSystemAlertsProcessor(deps), { connection }),
  new Worker(QUEUE_NAMES.keywordSearch, createKeywordSearchProcessor(deps), { connection }),
];

/**
 * A keyword-search job that dies without reaching the processor's own catch
 * block (killed process, stalled-job retries exhausted) would otherwise leave
 * its row `running` forever. Only writes to a row still in a non-terminal
 * state, so it never overwrites counts the processor itself already recorded
 * before rethrowing.
 */
async function failUnfinishedKeywordSearch(data: KeywordSearchJobData, message: string): Promise<void> {
  const existing = await getKeywordSearchById(prisma, data.keywordSearchId);
  if (!existing || (existing.status !== "queued" && existing.status !== "running")) {
    return;
  }
  const finishedAt = new Date();
  await finishKeywordSearch(prisma, {
    id: existing.id,
    status: "failed",
    videosFound: existing.videosFound ?? 0,
    recommendedVideosFound: existing.recommendedVideosFound ?? 0,
    errorMessage: message,
    finishedAt,
  });
  await finishJobRun(prisma, {
    id: data.jobRunId,
    status: "failed",
    finishedAt,
    durationMs: finishedAt.getTime() - existing.createdAt.getTime(),
    resultCount: null,
    errorMessage: message,
  });
}

for (const worker of workers) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, status: "error" }, error.message);

    if (worker.name !== QUEUE_NAMES.keywordSearch) {
      return;
    }
    const data = job?.data as KeywordSearchJobData | undefined;
    if (!data?.keywordSearchId) {
      return;
    }
    failUnfinishedKeywordSearch(data, error.message).catch((writeError) =>
      logger.error(
        { jobId: job?.id, queue: worker.name, status: "error" },
        `failed to mark keyword search ${data.keywordSearchId} failed: ${String(writeError)}`,
      ),
    );
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
  "worker process started: video-enrichment, channel-enrichment, video-monitoring, video-scoring, channel-video-discovery, channel-scoring, video-classification, topic-normalization, topic-trend-aggregation, system-alerts, keyword-search",
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
