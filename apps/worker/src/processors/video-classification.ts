import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import {
  finishJobRun,
  getOrCreateCandidateTopic,
  listVideosEligibleForClassification,
  recordAiClassificationRun,
  startJobRun,
  updateVideoClassification,
  upsertVideoTopic,
  type ClassificationEligibleVideo,
} from "@yvi/db";
import { GeminiApiError } from "@yvi/ai-client";
import { QUEUE_NAMES, type VideoClassificationJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { checkAiBudgetGuard } from "./quota";

/** Task-local cap, mirroring `video-monitoring.ts`'s `MAX_VIDEOS_PER_TICK`: bounds how many Gemini calls one tick can make, since (unlike `videos.list`) each video is its own call, not a batch. */
const MAX_VIDEOS_PER_TICK = 25;

/** Task-local: the classification prompt's shape version, recorded alongside `model` so a future prompt change doesn't get confused with the model's own output drifting (PRD §19.3 input-hash/version/model triple). */
const PROMPT_VERSION = "v1";

function hashInput(video: ClassificationEligibleVideo): string {
  return createHash("sha256")
    .update(JSON.stringify({ title: video.title, description: video.description, tags: video.tags, categoryId: video.categoryId }))
    .digest("hex");
}

/**
 * One tick = select up to `MAX_VIDEOS_PER_TICK` videos with no successful
 * classification run yet (PRD §10/§19.3), AI-budget-guard the whole batch
 * (one unit per video, the same "one call = one unit" cost model
 * `sumTodayAiUsage` counts by), then classify one at a time. Each video's
 * call is wrapped in its own try/catch so one bad response (schema failure,
 * exhausted retries, circuit open) records a failed run and moves on rather
 * than failing the whole tick (plan Risk: "a failing schema validation ...
 * is a classification failure, not a crash").
 *
 * `secondary_topics` is persisted in full (already capped at 5 by
 * `ClassificationResultSchema`) rather than re-capped here — a second,
 * smaller cap at this layer would be an arbitrary, undocumented number with
 * no PRD or schema backing it.
 */
export function createVideoClassificationProcessor(deps: ProcessorDeps) {
  return async function processVideoClassification(
    job: Job<VideoClassificationJobData>,
  ): Promise<{ classified: number; failed: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.videoClassification });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.videoClassification,
      startedAt,
    });

    try {
      const eligible = await listVideosEligibleForClassification(deps.db, MAX_VIDEOS_PER_TICK);
      if (eligible.length === 0) {
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "completed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: 0,
          errorMessage: null,
        });
        return { classified: 0, failed: 0 };
      }

      const guard = await checkAiBudgetGuard(deps.db, eligible.length, startedAt);
      if (!guard.allowed) {
        log.warn({ status: "blocked", aiEstimate: guard.projectedUsage }, "AI budget guard blocked video-classification run");
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "failed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: null,
          errorMessage: `AI budget guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
        });
        return { classified: 0, failed: 0 };
      }

      let classified = 0;
      let failed = 0;

      for (const video of eligible) {
        const completedAt = now();
        try {
          const result = await deps.ai.classifyVideo({
            title: video.title,
            description: video.description,
            tags: video.tags,
            categoryId: video.categoryId,
            channelTitle: video.channelTitle,
            channelDescription: video.channelDescription,
          });

          await recordAiClassificationRun(deps.db, {
            videoId: video.id,
            model: deps.aiModel,
            promptVersion: PROMPT_VERSION,
            inputHash: hashInput(video),
            output: result as unknown as object,
            status: "success",
            errorMessage: null,
            completedAt,
          });

          const primaryTopic = await getOrCreateCandidateTopic(deps.db, {
            canonicalName: result.primary_topic,
            description: "",
            confidence: result.confidence,
          });
          await upsertVideoTopic(deps.db, {
            videoId: video.id,
            topicId: primaryTopic.id,
            relationType: "primary",
            confidence: result.confidence,
            classificationModel: deps.aiModel,
            promptVersion: PROMPT_VERSION,
            classifiedAt: completedAt,
          });

          for (const secondaryLabel of result.secondary_topics) {
            const secondaryTopic = await getOrCreateCandidateTopic(deps.db, {
              canonicalName: secondaryLabel,
              description: "",
              confidence: result.confidence,
            });
            await upsertVideoTopic(deps.db, {
              videoId: video.id,
              topicId: secondaryTopic.id,
              relationType: "secondary",
              confidence: result.confidence,
              classificationModel: deps.aiModel,
              promptVersion: PROMPT_VERSION,
              classifiedAt: completedAt,
            });
          }

          await updateVideoClassification(deps.db, video.id, result.format, result.confidence);
          classified += 1;
        } catch (error) {
          const message = error instanceof GeminiApiError ? `${error.code}: ${error.message}` : String(error);
          log.error({ status: "error", videoId: video.id, errorCode: error instanceof GeminiApiError ? error.code : "unknown" }, message);
          await recordAiClassificationRun(deps.db, {
            videoId: video.id,
            model: deps.aiModel,
            promptVersion: PROMPT_VERSION,
            inputHash: hashInput(video),
            output: null,
            status: "failed",
            errorMessage: message,
            completedAt,
          });
          failed += 1;
        }
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: classified,
        errorMessage: null,
      });
      return { classified, failed };
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
