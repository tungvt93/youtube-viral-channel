import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { SystemAlertsJobData } from "@yvi/shared";

const { createAlertIfDue, finishJobRun, getDailyBudget, startJobRun, sumTodayQuotaUsage } = vi.hoisted(() => ({
  createAlertIfDue: vi.fn(),
  finishJobRun: vi.fn(),
  getDailyBudget: vi.fn(),
  startJobRun: vi.fn(),
  sumTodayQuotaUsage: vi.fn(),
}));

vi.mock("@yvi/db", () => ({ createAlertIfDue, finishJobRun, getDailyBudget, startJobRun, sumTodayQuotaUsage }));

import { createSystemAlertsProcessor, JOB_BACKLOG_THRESHOLD, SYSTEM_ALERT_COOLDOWN_MS } from "./system-alerts";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<SystemAlertsJobData> {
  return { id: "alerts-tick-1", name: "system-alerts", data: {} } as unknown as Job<SystemAlertsJobData>;
}

function makeQueue(name: string, counts: { waiting?: number; delayed?: number } = {}) {
  return { name, getJobCounts: vi.fn().mockResolvedValue({ waiting: counts.waiting ?? 0, delayed: counts.delayed ?? 0 }) };
}

const NOW = new Date("2026-11-06T12:00:00Z");

function makeDeps(queues: Record<string, ReturnType<typeof makeQueue>> = {}) {
  return {
    db: {} as never,
    ai: {} as never,
    aiModel: "unused",
    youtube: {} as never,
    queues: queues as never,
    logger: makeLogger() as never,
    now: () => NOW,
  };
}

describe("createSystemAlertsProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "alerts-tick-1" });
  });

  it("creates no alerts when quota is below warn and every queue is under the backlog threshold", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(1_000);

    const result = await createSystemAlertsProcessor(makeDeps({ q1: makeQueue("discovery-search", { waiting: 1 }) }))(makeJob());

    expect(result).toEqual({ quotaAlertsCreated: 0, backlogAlertsCreated: 0 });
    expect(createAlertIfDue).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
  });

  it("creates a quota_threshold alert once usage crosses the warn band", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(7_500);
    createAlertIfDue.mockResolvedValue({ id: "alert-1" });

    const result = await createSystemAlertsProcessor(makeDeps())(makeJob());

    expect(result.quotaAlertsCreated).toBe(1);
    expect(createAlertIfDue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        alertType: "quota_threshold",
        entityType: "system",
        entityId: "youtube_quota",
        severity: "warn",
        triggeredAt: NOW,
      }),
      SYSTEM_ALERT_COOLDOWN_MS,
    );
  });

  it("escalates severity to critical once usage crosses the critical band", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(9_600);
    createAlertIfDue.mockResolvedValue({ id: "alert-1" });

    await createSystemAlertsProcessor(makeDeps())(makeJob());

    expect(createAlertIfDue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ severity: "critical" }), SYSTEM_ALERT_COOLDOWN_MS);
  });

  it("does not double-count a quota alert when createAlertIfDue reports the cooldown is still active", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(7_500);
    createAlertIfDue.mockResolvedValue(null);

    const result = await createSystemAlertsProcessor(makeDeps())(makeJob());

    expect(result.quotaAlertsCreated).toBe(0);
  });

  it("creates a job_backlog alert for a queue whose waiting+delayed exceeds the threshold", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(0);
    createAlertIfDue.mockResolvedValue({ id: "alert-1" });

    const result = await createSystemAlertsProcessor(
      makeDeps({ videoScoring: makeQueue("video-scoring", { waiting: JOB_BACKLOG_THRESHOLD + 1 }) }),
    )(makeJob());

    expect(result.backlogAlertsCreated).toBe(1);
    expect(createAlertIfDue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        alertType: "job_backlog",
        entityType: "queue",
        entityId: "video-scoring",
        severity: "warning",
        triggeredAt: NOW,
      }),
      SYSTEM_ALERT_COOLDOWN_MS,
    );
  });

  it("does not fire a job_backlog alert when a queue's backlog sits exactly at the threshold", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(0);

    const result = await createSystemAlertsProcessor(
      makeDeps({ videoScoring: makeQueue("video-scoring", { waiting: JOB_BACKLOG_THRESHOLD }) }),
    )(makeJob());

    expect(result.backlogAlertsCreated).toBe(0);
    expect(createAlertIfDue).not.toHaveBeenCalled();
  });

  it("checks every queue independently and sums backlog alerts across all of them", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(0);
    createAlertIfDue.mockResolvedValue({ id: "alert-1" });

    const result = await createSystemAlertsProcessor(
      makeDeps({
        a: makeQueue("queue-a", { waiting: JOB_BACKLOG_THRESHOLD + 1 }),
        b: makeQueue("queue-b", { delayed: JOB_BACKLOG_THRESHOLD + 5 }),
        c: makeQueue("queue-c", { waiting: 1 }),
      }),
    )(makeJob());

    expect(result.backlogAlertsCreated).toBe(2);
    expect(createAlertIfDue).toHaveBeenCalledTimes(2);
  });

  it("fails the JobRun and rethrows when reading quota usage errors", async () => {
    getDailyBudget.mockRejectedValue(new Error("boom"));

    await expect(createSystemAlertsProcessor(makeDeps())(makeJob())).rejects.toThrow("boom");

    expect(createAlertIfDue).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
