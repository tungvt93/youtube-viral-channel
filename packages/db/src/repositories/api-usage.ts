import type { ApiUsageLog, PrismaClient } from "../../generated/client";

export interface RecordApiUsageInput {
  endpoint: string;
  quotaEstimate: number;
  status: string;
  marketId: string | null;
  requestTime: Date;
}

export function recordApiUsage(db: PrismaClient, input: RecordApiUsageInput): Promise<ApiUsageLog> {
  return db.apiUsageLog.create({
    data: {
      endpoint: input.endpoint,
      quotaEstimate: input.quotaEstimate,
      status: input.status,
      marketId: input.marketId,
      requestTime: input.requestTime,
    },
  });
}

/** UTC day window `[dayStart, dayEnd)` containing `day`, shared by every "today" aggregate below. */
function utcDayWindow(day: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

/**
 * Sums `quota_estimate` for all api_usage_logs rows with `request_time` on
 * the given day (UTC), feeding the quota guard's pure decision function
 * (PRD §18, [[quota-guard]]).
 */
export async function sumTodayQuotaUsage(db: PrismaClient, now: Date): Promise<number> {
  const { dayStart, dayEnd } = utcDayWindow(now);
  const result = await db.apiUsageLog.aggregate({
    _sum: { quotaEstimate: true },
    where: { requestTime: { gte: dayStart, lt: dayEnd } },
  });
  return result._sum.quotaEstimate ?? 0;
}

export interface QuotaUsageByEndpoint {
  endpoint: string;
  totalQuota: number;
}

/** `GET /system/quota` backing query (PRD §18.2-18.4): today's quota usage grouped by endpoint. */
export async function sumQuotaUsageByEndpoint(db: PrismaClient, day: Date): Promise<QuotaUsageByEndpoint[]> {
  const { dayStart, dayEnd } = utcDayWindow(day);
  const rows = await db.apiUsageLog.groupBy({
    by: ["endpoint"],
    where: { requestTime: { gte: dayStart, lt: dayEnd } },
    _sum: { quotaEstimate: true },
  });
  return rows.map((row) => ({ endpoint: row.endpoint, totalQuota: row._sum.quotaEstimate ?? 0 }));
}

export interface QuotaUsageByMarket {
  marketId: string | null;
  totalQuota: number;
}

/** `GET /system/quota` backing query (PRD §18.2-18.4): today's quota usage grouped by market. */
export async function sumQuotaUsageByMarket(db: PrismaClient, day: Date): Promise<QuotaUsageByMarket[]> {
  const { dayStart, dayEnd } = utcDayWindow(day);
  const rows = await db.apiUsageLog.groupBy({
    by: ["marketId"],
    where: { requestTime: { gte: dayStart, lt: dayEnd } },
    _sum: { quotaEstimate: true },
  });
  return rows.map((row) => ({ marketId: row.marketId, totalQuota: row._sum.quotaEstimate ?? 0 }));
}

/**
 * Count of today's `status = "error"` rows (PRD §16.7 System Health) —
 * `"error"` is the only non-success status any `recordApiUsage(...)` call
 * site under `apps/worker/src/processors/` ever writes, confirmed by
 * reading every call site this session, so this matches exactly rather
 * than guessing a broader `not: "success"` condition.
 */
export async function countFailedCallsToday(db: PrismaClient, day: Date): Promise<number> {
  const { dayStart, dayEnd } = utcDayWindow(day);
  return db.apiUsageLog.count({
    where: { requestTime: { gte: dayStart, lt: dayEnd }, status: "error" },
  });
}
