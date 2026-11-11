import type { JobRun, PrismaClient } from "../../generated/client";

export interface StartJobRunInput {
  id?: string;
  jobName: string;
  queue: string;
  startedAt: Date;
}

/**
 * JobRun is the source of truth for job status (PRD §22.4), not BullMQ/Redis
 * state. `id` can be pre-assigned (e.g. an idempotency key) so the API/
 * scheduler layer can use it as the BullMQ jobId too, letting callers poll
 * GET /discovery/jobs/:id immediately after enqueueing. When a row with that
 * id already exists (a same-day retry of the same idempotency key), the
 * existing row is returned unchanged instead of erroring, so the caller's
 * subsequent `queue.add` with the same jobId is BullMQ's own natural no-op.
 */
export function startJobRun(db: PrismaClient, input: StartJobRunInput): Promise<JobRun> {
  const data = {
    jobName: input.jobName,
    queue: input.queue,
    status: "running",
    startedAt: input.startedAt,
  };
  if (!input.id) {
    return db.jobRun.create({ data });
  }
  return db.jobRun.upsert({
    where: { id: input.id },
    create: { id: input.id, ...data },
    update: {},
  });
}

export interface FinishJobRunInput {
  id: string;
  status: "completed" | "failed";
  finishedAt: Date;
  durationMs: number;
  resultCount: number | null;
  errorMessage: string | null;
}

export function finishJobRun(db: PrismaClient, input: FinishJobRunInput): Promise<JobRun> {
  return db.jobRun.update({
    where: { id: input.id },
    data: {
      status: input.status,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      resultCount: input.resultCount,
      errorMessage: input.errorMessage,
    },
  });
}

export function getJobRunById(db: PrismaClient, id: string): Promise<JobRun | null> {
  return db.jobRun.findUnique({ where: { id } });
}

/** `GET /discovery/jobs` and `GET /system/jobs` backing query — most-recently-started jobs first, same ordering as the `[queue, startedAt desc]` index. */
export function listRecentJobRuns(db: PrismaClient, limit: number): Promise<JobRun[]> {
  return db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}
