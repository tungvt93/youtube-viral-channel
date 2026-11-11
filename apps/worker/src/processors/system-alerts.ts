import type { Job } from "bullmq";
import { createAlertIfDue, finishJobRun, getDailyBudget, startJobRun, sumTodayQuotaUsage } from "@yvi/db";
import { quotaBand, QUEUE_NAMES, type SystemAlertsJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";

/**
 * PRD §11.7 "chống gửi trùng bằng ... cooldown", shorter than Phase 6c's
 * 24h (plan Decisions, 2026-11-06): quota resets daily and a queue backlog
 * can change within hours, so a day-long cooldown would let an admin miss a
 * same-day second crossing into a worse band.
 */
export const SYSTEM_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * `waiting + delayed` job count per queue above which a `job_backlog` alert
 * fires — task-local default (plan Decisions, 2026-11-06), no production
 * traffic history to calibrate against yet.
 */
export const JOB_BACKLOG_THRESHOLD = 50;

/**
 * One tick = check today's YouTube quota usage against its 70/85/95% bands
 * (shared with `GET /system/quota` via `quotaBand`) and every BullMQ
 * queue's `waiting + delayed` depth, firing `quota_threshold`/`job_backlog`
 * alerts through the existing Phase 6c `createAlertIfDue` dedup/cooldown
 * mechanism. No YouTube API calls, so no quota guard — same as
 * `channel-scoring.ts`.
 */
export function createSystemAlertsProcessor(deps: ProcessorDeps) {
  return async function processSystemAlerts(
    job: Job<SystemAlertsJobData>,
  ): Promise<{ quotaAlertsCreated: number; backlogAlertsCreated: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.systemAlerts });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.systemAlerts,
      startedAt,
    });

    try {
      const triggeredAt = now();
      let quotaAlertsCreated = 0;
      let backlogAlertsCreated = 0;

      const [budget, usedToday] = await Promise.all([getDailyBudget(deps.db), sumTodayQuotaUsage(deps.db, triggeredAt)]);
      const percentUsed = budget > 0 ? Math.round((usedToday / budget) * 100) : 0;
      const band = quotaBand(percentUsed);

      if (band !== "ok") {
        const created = await createAlertIfDue(
          deps.db,
          {
            alertType: "quota_threshold",
            entityType: "system",
            entityId: "youtube_quota",
            message: `YouTube API quota at ${percentUsed}% of today's budget (${band})`,
            severity: band,
            triggeredAt,
          },
          SYSTEM_ALERT_COOLDOWN_MS,
        );
        if (created) {
          quotaAlertsCreated += 1;
        }
      }

      for (const queue of Object.values(deps.queues)) {
        const counts = await queue.getJobCounts("waiting", "delayed");
        const backlog = (counts.waiting ?? 0) + (counts.delayed ?? 0);
        if (backlog > JOB_BACKLOG_THRESHOLD) {
          const created = await createAlertIfDue(
            deps.db,
            {
              alertType: "job_backlog",
              entityType: "queue",
              entityId: queue.name,
              message: `Queue "${queue.name}" has ${backlog} waiting/delayed jobs`,
              severity: "warning",
              triggeredAt,
            },
            SYSTEM_ALERT_COOLDOWN_MS,
          );
          if (created) {
            backlogAlertsCreated += 1;
          }
        }
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: quotaAlertsCreated + backlogAlertsCreated,
        errorMessage: null,
      });
      return { quotaAlertsCreated, backlogAlertsCreated };
    } catch (error) {
      const message = String(error);
      log.error({ status: "error" }, message);
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: message,
      });
      throw error;
    }
  };
}
