export type QuotaBand = "ok" | "warn" | "high" | "critical";

/** Quota usage bands (PRD §18.2-18.4: warn at 70/85/95% of budget). */
export const QUOTA_WARN_PERCENT = 70;
export const QUOTA_HIGH_PERCENT = 85;
export const QUOTA_CRITICAL_PERCENT = 95;

/** Shared between `apps/api`'s `GET /system/quota` and `apps/worker`'s `system-alerts` tick so both agree on what counts as "warn" (plan Decisions, 2026-11-06). */
export function quotaBand(percentUsed: number): QuotaBand {
  if (percentUsed >= QUOTA_CRITICAL_PERCENT) return "critical";
  if (percentUsed >= QUOTA_HIGH_PERCENT) return "high";
  if (percentUsed >= QUOTA_WARN_PERCENT) return "warn";
  return "ok";
}
