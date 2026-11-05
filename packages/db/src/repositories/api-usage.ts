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

/**
 * Sums `quota_estimate` for all api_usage_logs rows with `request_time` on
 * the given day (UTC), feeding the quota guard's pure decision function
 * (PRD §18, [[quota-guard]]).
 */
export async function sumTodayQuotaUsage(db: PrismaClient, now: Date): Promise<number> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const result = await db.apiUsageLog.aggregate({
    _sum: { quotaEstimate: true },
    where: { requestTime: { gte: dayStart, lt: dayEnd } },
  });
  return result._sum.quotaEstimate ?? 0;
}
