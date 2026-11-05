import type { Queue } from "bullmq";
import type { PrismaClient } from "@yvi/db";
import { startJobRun } from "@yvi/db";

/**
 * Creates the JobRun row (the source of truth for job status, PRD §22.4)
 * before handing the job to BullMQ, and uses its id as both the row's
 * primary key and the BullMQ jobId so a run can be looked up by either.
 * Passing an explicit `jobId` also makes BullMQ a no-op on a duplicate
 * enqueue of a still-pending/active job with the same id.
 */
export async function enqueueWithJobRun<Data extends { jobRunId: string }>(
  db: PrismaClient,
  queue: Queue<Data>,
  jobName: string,
  dataWithoutJobRunId: Omit<Data, "jobRunId">,
  jobId: string,
): Promise<string> {
  const jobRun = await startJobRun(db, {
    id: jobId,
    jobName,
    queue: queue.name,
    startedAt: new Date(),
  });
  await queue.add(jobName as never, { ...dataWithoutJobRunId, jobRunId: jobRun.id } as never, { jobId });
  return jobRun.id;
}
