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

const AI_DAILY_BUDGET_KEY = "ai_daily_classification_budget";
/**
 * First-cut, task-local default (PRD §19.3 requires *a* daily AI budget but
 * does not specify a number). Unlike the YouTube 10,000-unit figure (an
 * actual API quota), this is an unverified guess with no real Gemini
 * pricing/rate-limit calibration behind it yet — flagged in the Phase 5 plan
 * Risks section as needing real calibration, not a resolved product number.
 * Configurable via `app_settings` so it can be tuned without a code change.
 */
const DEFAULT_AI_DAILY_BUDGET = 500;

/**
 * Reads the configurable daily AI-classification budget from app_settings,
 * defaulting to `DEFAULT_AI_DAILY_BUDGET` when no row exists yet. Mirrors
 * `getDailyBudget` exactly, against a separate key so the YouTube quota
 * guard and AI budget guard are independently configurable.
 */
export async function getAiDailyBudget(db: PrismaClient): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: AI_DAILY_BUDGET_KEY } });
  if (!row) {
    return DEFAULT_AI_DAILY_BUDGET;
  }
  const value = row.value;
  return typeof value === "number" ? value : DEFAULT_AI_DAILY_BUDGET;
}
