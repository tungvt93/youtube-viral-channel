import { Injectable, NotFoundException, OnModuleDestroy, Optional } from "@nestjs/common";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import { getDiscoveryQueryById, getJobRunById, prisma, startJobRun } from "@yvi/db";
import { discoveryIdempotencyKey, formatDateBucket, QUEUE_NAMES } from "@yvi/shared";
import { createRedisConnection } from "../redis";

/**
 * Manual discovery trigger + job status (PRD §25 Phase 1, FR-DIS-10). This is
 * intentionally the only `apps/api` surface this phase ships — see plan
 * Decisions, 2026-11-05.
 */
export interface DiscoveryServiceDeps {
  connection?: IORedis;
  discoveryRegional?: Queue;
  discoverySearch?: Queue;
}

@Injectable()
export class DiscoveryService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly discoveryRegional: Queue;
  private readonly discoverySearch: Queue;

  constructor(@Optional() deps: DiscoveryServiceDeps = {}) {
    this.connection = deps.connection ?? createRedisConnection();
    this.discoveryRegional = deps.discoveryRegional ?? new Queue(QUEUE_NAMES.discoveryRegional, { connection: this.connection });
    this.discoverySearch = deps.discoverySearch ?? new Queue(QUEUE_NAMES.discoverySearch, { connection: this.connection });
  }

  async triggerRun(discoveryQueryId: string): Promise<{ jobId: string; status: string }> {
    const discoveryQuery = await getDiscoveryQueryById(prisma, discoveryQueryId);
    if (!discoveryQuery) {
      throw new NotFoundException(`discovery query ${discoveryQueryId} not found`);
    }

    const isRegional = discoveryQuery.strategy === "most_popular";
    const queue = isRegional ? this.discoveryRegional : this.discoverySearch;
    const queueName = isRegional ? QUEUE_NAMES.discoveryRegional : QUEUE_NAMES.discoverySearch;

    const jobId = discoveryIdempotencyKey({
      strategy: discoveryQuery.strategy,
      marketCode: discoveryQuery.market.code,
      query: discoveryQuery.query,
      dateBucket: formatDateBucket(new Date()),
    });

    // Pre-create the JobRun under the idempotency key so a same-day re-trigger
    // is a no-op (the processor upserts on the same id, and BullMQ itself
    // dedups the `queue.add` call by jobId).
    await startJobRun(prisma, { id: jobId, jobName: queueName, queue: queueName, startedAt: new Date() });
    await queue.add(queueName, { discoveryQueryId }, { jobId });

    return { jobId, status: "queued" };
  }

  async getJobStatus(jobId: string) {
    const jobRun = await getJobRunById(prisma, jobId);
    if (!jobRun) {
      throw new NotFoundException(`job ${jobId} not found`);
    }
    return jobRun;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.discoveryRegional.close(), this.discoverySearch.close()]);
    await this.connection.quit();
  }
}
