import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, Optional } from "@nestjs/common";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import {
  createDiscoveryQuery,
  getDiscoveryQueryById,
  getJobRunById,
  listDiscoveryQueriesWithMarket,
  listRecentJobRuns,
  prisma,
  startJobRun,
  updateDiscoveryQuery,
  type DiscoveryQueryWithMarket,
  type JobRun,
} from "@yvi/db";
import { discoveryIdempotencyKey, formatDateBucket, QUEUE_NAMES } from "@yvi/shared";
import { createRedisConnection } from "../redis";

/** Default/maximum page size for `GET /discovery/jobs` — same reasoning as `MAX_LIMIT` elsewhere. */
const DEFAULT_JOBS_LIMIT = 50;
const MAX_JOBS_LIMIT = 100;

export interface DiscoveryQueryDto {
  id: string;
  marketId: string;
  marketCode: string;
  topicId: string | null;
  query: string;
  language: string;
  strategy: string;
  priority: number;
  maxPagesPerRun: number;
  frequencyMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
}

function toDiscoveryQueryDto(row: DiscoveryQueryWithMarket): DiscoveryQueryDto {
  return {
    id: row.id,
    marketId: row.marketId,
    marketCode: row.market.code,
    topicId: row.topicId,
    query: row.query,
    language: row.language,
    strategy: row.strategy,
    priority: row.priority,
    maxPagesPerRun: row.maxPagesPerRun,
    frequencyMinutes: row.frequencyMinutes,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
  };
}

/** `POST /discovery/queries` request body (PRD §16.6, FR-DIS-01). */
export interface CreateDiscoveryQueryBody {
  marketId?: string;
  topicId?: string | null;
  query?: string;
  language?: string;
  strategy?: string;
  priority?: number;
  maxPagesPerRun?: number;
  frequencyMinutes?: number;
  enabled?: boolean;
}

/** `PATCH /discovery/queries/:id` request body — only these typed fields, never the raw `config` JSON column (see plan Decisions). */
export interface UpdateDiscoveryQueryBody {
  query?: string;
  priority?: number;
  maxPagesPerRun?: number;
  frequencyMinutes?: number;
  enabled?: boolean;
}

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

  /** `GET /discovery/queries` (PRD §16.6) — admin needs to see disabled queries too, unlike the worker's own `listEnabledDiscoveryQueriesWithMarket`. */
  async listQueries(): Promise<DiscoveryQueryDto[]> {
    const rows = await listDiscoveryQueriesWithMarket(prisma);
    return rows.map(toDiscoveryQueryDto);
  }

  /** `POST /discovery/queries` (PRD §16.6, FR-DIS-01). */
  async createQuery(body: CreateDiscoveryQueryBody): Promise<DiscoveryQueryDto> {
    if (!body?.marketId || !body.query || !body.language || !body.strategy) {
      throw new BadRequestException("marketId, query, language, and strategy are required");
    }
    if (typeof body.priority !== "number" || typeof body.maxPagesPerRun !== "number" || typeof body.frequencyMinutes !== "number") {
      throw new BadRequestException("priority, maxPagesPerRun, and frequencyMinutes must be numbers");
    }
    const row = await createDiscoveryQuery(prisma, {
      marketId: body.marketId,
      topicId: body.topicId ?? null,
      query: body.query,
      language: body.language,
      strategy: body.strategy,
      priority: body.priority,
      maxPagesPerRun: body.maxPagesPerRun,
      frequencyMinutes: body.frequencyMinutes,
      enabled: body.enabled ?? true,
    });
    return toDiscoveryQueryDto(row);
  }

  /** `PATCH /discovery/queries/:id` — only the typed fields in `UpdateDiscoveryQueryBody`, never the raw `config` JSON column (see plan Decisions). */
  async updateQuery(id: string, body: UpdateDiscoveryQueryBody): Promise<DiscoveryQueryDto> {
    const existing = await getDiscoveryQueryById(prisma, id);
    if (!existing) {
      throw new NotFoundException(`discovery query ${id} not found`);
    }
    const row = await updateDiscoveryQuery(prisma, id, {
      query: body.query,
      priority: body.priority,
      maxPagesPerRun: body.maxPagesPerRun,
      frequencyMinutes: body.frequencyMinutes,
      enabled: body.enabled,
    });
    return toDiscoveryQueryDto(row);
  }

  /** `GET /discovery/jobs` (PRD §16.6) — most-recently-started jobs first; no queue-scoped filter exists in `packages/db` yet, same set `GET /system/jobs` exposes. */
  async listJobs(limit: string | undefined): Promise<JobRun[]> {
    const parsed = limit !== undefined ? Number(limit) : DEFAULT_JOBS_LIMIT;
    const clamped = Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_JOBS_LIMIT, 1), MAX_JOBS_LIMIT);
    return listRecentJobRuns(prisma, clamped);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.discoveryRegional.close(), this.discoverySearch.close()]);
    await this.connection.quit();
  }
}
