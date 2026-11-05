import { getDailyBudget, sumTodayQuotaUsage, type PrismaClient } from "@yvi/db";
import { evaluateQuotaGuard, type QuotaGuardDecision } from "@yvi/shared";

/** Reads today's usage + configured budget and applies the pure quota guard decision (PRD §18.3). */
export async function checkQuotaGuard(
  db: PrismaClient,
  estimatedCost: number,
  now: Date,
): Promise<QuotaGuardDecision> {
  const [dailyBudget, usedToday] = await Promise.all([getDailyBudget(db), sumTodayQuotaUsage(db, now)]);
  return evaluateQuotaGuard({ dailyBudget, usedToday, estimatedCost });
}
