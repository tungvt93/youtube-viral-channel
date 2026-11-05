import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import {
  applyTopicMerge,
  applyTopicPromotion,
  finishJobRun,
  listCandidateTopicsForNormalization,
  recordAiClassificationRun,
  startJobRun,
  type NormalizationCandidateRow,
} from "@yvi/db";
import { GeminiApiError, MAX_CANDIDATES_PER_NORMALIZATION_RUN } from "@yvi/ai-client";
import { QUEUE_NAMES, type TopicNormalizationJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { checkAiBudgetGuard } from "./quota";

/** Task-local, paired with `video-classification.ts`'s `PROMPT_VERSION` but versioned independently — a normalization prompt change shouldn't bump the classification prompt's version. */
const PROMPT_VERSION = "v1";

function hashCandidates(candidates: NormalizationCandidateRow[]): string {
  return createHash("sha256")
    .update(JSON.stringify(candidates.map((candidate) => candidate.id)))
    .digest("hex");
}

/**
 * One tick = one batched `normalizeTopics` call over the current
 * `status = "candidate"` topics (up to `MAX_CANDIDATES_PER_NORMALIZATION_RUN`,
 * the same bound `GeminiProvider` itself applies, so the DB read never
 * fetches more than one call will use), applying each proposal's
 * merge/promotion. Recorded via `recordAiClassificationRun` with
 * `videoId: null` — that column is nullable specifically so this
 * non-video-scoped AI call shares the same usage-counting table (and the
 * same `sumTodayAiUsage`-backed daily budget) as `video-classification`.
 *
 * A single Gemini call either succeeds or fails for the whole batch (no
 * per-candidate retry loop, unlike classification's per-video calls) — a
 * failed run records the attempt and rethrows so the tick's JobRun fails
 * and the next tick retries the same (still-candidate) topics.
 */
export function createTopicNormalizationProcessor(deps: ProcessorDeps) {
  return async function processTopicNormalization(
    job: Job<TopicNormalizationJobData>,
  ): Promise<{ merged: number; promoted: number; kept: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.topicNormalization });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.topicNormalization,
      startedAt,
    });

    try {
      const candidates = await listCandidateTopicsForNormalization(deps.db, MAX_CANDIDATES_PER_NORMALIZATION_RUN);
      if (candidates.length === 0) {
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "completed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: 0,
          errorMessage: null,
        });
        return { merged: 0, promoted: 0, kept: 0 };
      }

      const guard = await checkAiBudgetGuard(deps.db, 1, startedAt);
      if (!guard.allowed) {
        log.warn({ status: "blocked", aiEstimate: guard.projectedUsage }, "AI budget guard blocked topic-normalization run");
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "failed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: null,
          errorMessage: `AI budget guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
        });
        return { merged: 0, promoted: 0, kept: 0 };
      }

      const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      const completedAt = now();
      const inputHash = hashCandidates(candidates);

      let output;
      try {
        output = await deps.ai.normalizeTopics({
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            slug: candidate.slug,
            canonicalName: candidate.canonicalName,
            description: candidate.description,
            sampleVideoTitles: candidate.sampleVideoTitles,
            videoCount: candidate.videoCount,
          })),
        });
        await recordAiClassificationRun(deps.db, {
          videoId: null,
          model: deps.aiModel,
          promptVersion: PROMPT_VERSION,
          inputHash,
          output: output as unknown as object,
          status: "success",
          errorMessage: null,
          completedAt,
        });
      } catch (error) {
        const message = error instanceof GeminiApiError ? `${error.code}: ${error.message}` : String(error);
        await recordAiClassificationRun(deps.db, {
          videoId: null,
          model: deps.aiModel,
          promptVersion: PROMPT_VERSION,
          inputHash,
          output: null,
          status: "failed",
          errorMessage: message,
          completedAt,
        });
        throw error;
      }

      let merged = 0;
      let promoted = 0;
      let kept = 0;

      for (const proposal of output.proposals) {
        if (!byId.has(proposal.topic_id)) {
          continue;
        }
        if (proposal.action === "merge") {
          if (!proposal.merge_into_topic_id || proposal.merge_into_topic_id === proposal.topic_id || !byId.has(proposal.merge_into_topic_id)) {
            continue;
          }
          await applyTopicMerge(deps.db, proposal.topic_id, proposal.merge_into_topic_id);
          merged += 1;
        } else if (proposal.action === "promote") {
          await applyTopicPromotion(deps.db, proposal.topic_id, {
            canonicalName: proposal.canonical_name,
            description: proposal.description,
          });
          promoted += 1;
        } else {
          kept += 1;
        }
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: candidates.length,
        errorMessage: null,
      });
      return { merged, promoted, kept };
    } catch (error) {
      const message = error instanceof GeminiApiError ? `${error.code}: ${error.message}` : String(error);
      log.error({ status: "error", errorCode: error instanceof GeminiApiError ? error.code : "unknown" }, message);
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
