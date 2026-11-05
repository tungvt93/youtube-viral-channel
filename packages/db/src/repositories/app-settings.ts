import type { PrismaClient } from "../../generated/client";

const DAILY_BUDGET_KEY = "youtube_daily_quota_budget";
const DEFAULT_DAILY_BUDGET = 10_000;

/**
 * Reads the configurable daily quota budget from app_settings, defaulting
 * to 10,000 (PRD §18, [[0001-mvp-scope-decisions]]) when no row exists yet.
 */
export async function getDailyBudget(db: PrismaClient): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: DAILY_BUDGET_KEY } });
  if (!row) {
    return DEFAULT_DAILY_BUDGET;
  }
  const value = row.value;
  return typeof value === "number" ? value : DEFAULT_DAILY_BUDGET;
}
