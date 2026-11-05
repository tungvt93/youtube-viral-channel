export interface QuotaGuardInput {
  /** Configured `app_settings.daily_budget` (default 10,000, per [[0001-mvp-scope-decisions]]). */
  dailyBudget: number;
  /** Sum of today's `api_usage_logs.quota_estimate`. */
  usedToday: number;
  /** Quota units the candidate job/call would consume. */
  estimatedCost: number;
}

export interface QuotaGuardDecision {
  allowed: boolean;
  remaining: number;
  projectedUsage: number;
}

/**
 * Pure quota budget decision (PRD §18.3): hard-stops a job whose estimated
 * cost would push today's usage over the configured daily budget. Contains
 * no Prisma/IO so it is unit-testable without a live database.
 */
export function evaluateQuotaGuard(input: QuotaGuardInput): QuotaGuardDecision {
  const remaining = input.dailyBudget - input.usedToday;
  const projectedUsage = input.usedToday + input.estimatedCost;
  return {
    allowed: projectedUsage <= input.dailyBudget,
    remaining,
    projectedUsage,
  };
}
