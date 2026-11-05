import IORedis from "ioredis";

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    maxRetriesPerRequest: null,
  });
}
