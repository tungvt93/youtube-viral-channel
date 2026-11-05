import type { AiClassificationRun, PrismaClient } from "../../generated/client";

export interface RecordAiClassificationRunInput {
  videoId: string | null;
  model: string;
  promptVersion: string;
  inputHash: string;
  output: object | null;
  status: "success" | "failed";
  errorMessage: string | null;
  completedAt: Date;
}

/**
 * Persists one `classifyVideo` call attempt, success or failure — a failed
 * run (bad schema validation, exhausted retries, circuit open) is a real,
 * queryable row, not a swallowed error (plan Risk: "a failing schema
 * validation ... is a classification failure, not a crash").
 */
export function recordAiClassificationRun(
  db: PrismaClient,
  input: RecordAiClassificationRunInput,
): Promise<AiClassificationRun> {
  return db.aiClassificationRun.create({
    data: {
      videoId: input.videoId,
      model: input.model,
      promptVersion: input.promptVersion,
      inputHash: input.inputHash,
      output: input.output ?? undefined,
      status: input.status,
      errorMessage: input.errorMessage,
      createdAt: input.completedAt,
      completedAt: input.completedAt,
    },
  });
}

/**
 * Counts `ai_classification_runs` rows created today (UTC), feeding the AI
 * budget guard (`evaluateQuotaGuard`, [[quota-guard]]) the same way
 * `sumTodayQuotaUsage` feeds the YouTube quota guard — except counting rows
 * (one call attempt each) rather than summing a cost column, since Gemini
 * calls don't carry a YouTube-style quota-unit cost.
 */
export async function sumTodayAiUsage(db: PrismaClient, now: Date): Promise<number> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return db.aiClassificationRun.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
}
