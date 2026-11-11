import { Injectable } from "@nestjs/common";
import {
  countFailedCallsToday,
  getDailyBudget,
  listAllMarkets,
  listRecentJobRuns,
  prisma,
  sumQuotaUsageByEndpoint,
  sumQuotaUsageByMarket,
  sumTodayQuotaUsage,
  type JobRun,
} from "@yvi/db";
import { quotaBand, QUOTA_CRITICAL_PERCENT, type QuotaBand } from "@yvi/shared";

/** Default/maximum page size for `GET /system/jobs` — same reasoning as `MAX_LIMIT` in the videos/channels modules. */
const DEFAULT_JOBS_LIMIT = 50;
const MAX_JOBS_LIMIT = 100;

/** `recentJobFailures` window — how many of the most-recently-started jobs count toward `GET /system/health`'s degraded signal. */
const RECENT_JOBS_WINDOW = 20;

/** Below this much elapsed UTC-day time, projecting end-of-day usage divides by a near-zero fraction — return today's raw usage unprojected instead (plan Decisions, 2026-11-06). */
const PROJECTION_MIN_ELAPSED_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SystemHealthDto {
  status: "ok" | "degraded";
  quotaPercentUsed: number;
  failedCallsToday: number;
  recentJobFailures: number;
}

export interface JobRunDto {
  id: string;
  jobName: string;
  queue: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultCount: number | null;
  errorMessage: string | null;
}

export interface SystemQuotaDto {
  budget: number;
  usedToday: number;
  percentUsed: number;
  band: QuotaBand;
  remainingBudget: number;
  projectedEndOfDay: number;
}

export interface ApiUsageByEndpointDto {
  endpoint: string;
  totalQuota: number;
}

export interface ApiUsageByMarketDto {
  marketId: string | null;
  marketCode: string | null;
  totalQuota: number;
}

export interface SystemApiUsageDto {
  byEndpoint: ApiUsageByEndpointDto[];
  byMarket: ApiUsageByMarketDto[];
}

function toJobRunDto(jobRun: JobRun): JobRunDto {
  return {
    id: jobRun.id,
    jobName: jobRun.jobName,
    queue: jobRun.queue,
    status: jobRun.status,
    startedAt: jobRun.startedAt.toISOString(),
    finishedAt: jobRun.finishedAt ? jobRun.finishedAt.toISOString() : null,
    durationMs: jobRun.durationMs,
    resultCount: jobRun.resultCount,
    errorMessage: jobRun.errorMessage,
  };
}

function parseJobsLimit(limit: string | undefined): number {
  const parsed = limit !== undefined ? Number(limit) : DEFAULT_JOBS_LIMIT;
  return Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_JOBS_LIMIT, 1), MAX_JOBS_LIMIT);
}

/** PRD §18.4 "Projection cuối ngày" — linear extrapolation of today's usage from the elapsed fraction of the current UTC day (plan Decisions, 2026-11-06). */
function projectEndOfDay(usedToday: number, now: Date): number {
  const startOfUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedMs = now.getTime() - startOfUtcDay;
  if (elapsedMs < PROJECTION_MIN_ELAPSED_MS) {
    return usedToday;
  }
  return Math.round(usedToday / (elapsedMs / DAY_MS));
}

@Injectable()
export class SystemService {
  /** `GET /system/health` (PRD §16.7, §11.8) — a single ok/degraded status composed from the same data the `jobs`/`quota` endpoints expose in detail. */
  async health(): Promise<SystemHealthDto> {
    const now = new Date();
    const [budget, usedToday, failedCallsToday, recentJobs] = await Promise.all([
      getDailyBudget(prisma),
      sumTodayQuotaUsage(prisma, now),
      countFailedCallsToday(prisma, now),
      listRecentJobRuns(prisma, RECENT_JOBS_WINDOW),
    ]);
    const quotaPercentUsed = budget > 0 ? Math.round((usedToday / budget) * 100) : 0;
    const recentJobFailures = recentJobs.filter((job) => job.status === "failed").length;
    const status: SystemHealthDto["status"] = quotaPercentUsed >= QUOTA_CRITICAL_PERCENT || recentJobFailures > 0 ? "degraded" : "ok";

    return { status, quotaPercentUsed, failedCallsToday, recentJobFailures };
  }

  /** `GET /system/jobs` (PRD §16.7) — most-recently-started jobs first. */
  async jobs(limit: string | undefined): Promise<JobRunDto[]> {
    const rows = await listRecentJobRuns(prisma, parseJobsLimit(limit));
    return rows.map(toJobRunDto);
  }

  /** `GET /system/quota` (PRD §16.7, §18.2-18.4) — today's usage vs. the configurable daily budget, banded at 70/85/95%, plus remaining budget and an end-of-day projection (both required by PRD §18.4, see plan Decisions). */
  async quota(): Promise<SystemQuotaDto> {
    const now = new Date();
    const [budget, usedToday] = await Promise.all([getDailyBudget(prisma), sumTodayQuotaUsage(prisma, now)]);
    const percentUsed = budget > 0 ? Math.round((usedToday / budget) * 100) : 0;

    return {
      budget,
      usedToday,
      percentUsed,
      band: quotaBand(percentUsed),
      remainingBudget: budget - usedToday,
      projectedEndOfDay: projectEndOfDay(usedToday, now),
    };
  }

  /** `GET /system/api-usage` (PRD §16.7, §18.2-18.4) — today's usage broken down by endpoint and by market (see plan Decisions: no calls-by-strategy breakdown). */
  async apiUsage(): Promise<SystemApiUsageDto> {
    const now = new Date();
    const [byEndpoint, byMarket, markets] = await Promise.all([
      sumQuotaUsageByEndpoint(prisma, now),
      sumQuotaUsageByMarket(prisma, now),
      listAllMarkets(prisma),
    ]);
    const marketCodeById = new Map(markets.map((market) => [market.id, market.code]));

    return {
      byEndpoint,
      byMarket: byMarket.map((row) => ({
        marketId: row.marketId,
        marketCode: row.marketId ? marketCodeById.get(row.marketId) ?? null : null,
        totalQuota: row.totalQuota,
      })),
    };
  }
}
