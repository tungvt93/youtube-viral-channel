import { logger } from "./common/logger";
import { createRedisConnection } from "./redis";
import { startHealthServer } from "./health-server";

const redis = createRedisConnection();
const port = process.env.WORKER_HEALTH_PORT ? Number(process.env.WORKER_HEALTH_PORT) : 3002;

startHealthServer(redis, port);

logger.info("worker process started, no queues registered yet (Phase 0 scaffold)");
