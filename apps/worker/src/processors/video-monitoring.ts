import type { Job } from "bullmq";
import {
  finishJobRun,
  insertVideoSnapshot,
  listVideosDueForSnapshot,
  recordApiUsage,
  startJobRun,
  updateVideoMonitoringState,
} from "@yvi/db";
import { QUOTA_COST, YouTubeApiError } from "@yvi/youtube-client";
import { computeNextSnapshotDueAt, nextMonitoringState, QUEUE_NAMES, type MonitoringState, type VideoMonitoringJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "videos.list(monitoring)";

/**
 * Caps how many due videos a single tick will snapshot, bounding quota
 * spend per tick regardless of how large the due set grows. `videos.list`
 * is still batched internally in groups of ≤50 by `@yvi/youtube-client`.
 */
const MAX_VIDEOS_PER_TICK = 200;

/**
 * One tick = one quota-guarded `videos.list` call over whichever videos are
 * currently due (PRD §7.3). Snapshot quality rules (§7.5), enforced here by
 * construction rather than by extra checks:
 *   - A whole-batch API error throws before any snapshot/state write runs,
 *     so nothing is written for any video in that batch.
 *   - A video the API no longer returns (absent from `items`, not an error)
 *     gets no snapshot row at all and transitions to `unavailable` — no 0
 *     substitution.
 *   - A returned count is written as-is, including one lower than the
 *     previous snapshot — there is no clamping/comparison against history.
 *
 * Creates its own JobRun keyed by the BullMQ job's own id, same as the
 * discovery processors — the scheduler's repeat template carries no
 * per-tick jobRunId to inject.
 */
export function createVideoMonitoringProcessor(deps: ProcessorDeps) {
  return async function processVideoMonitoring(job: Job<VideoMonitoringJobData>): Promise<{ snapshotted: number; unavailable: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.videoMonitoring });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.videoMonitoring,
      startedAt,
    });

    const dueVideos = await listVideosDueForSnapshot(deps.db, startedAt, MAX_VIDEOS_PER_TICK);
    if (dueVideos.length === 0) {
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: 0,
        errorMessage: null,
      });
      return { snapshotted: 0, unavailable: 0 };
    }

    const batches = Math.ceil(dueVideos.length / 50);
    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.videos_list * batches, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked video-monitoring run");
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: `quota guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
      });
      return { snapshotted: 0, unavailable: 0 };
    }

    try {
      const ids = dueVideos.map((video) => video.youtubeVideoId);
      let result;
      try {
        result = await deps.youtube.listVideosByIds(ids);
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.videos_list * result.callsMade,
          status: "success",
          marketId: null,
          requestTime: now(),
        });
      } catch (error) {
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.videos_list * batches,
          status: "error",
          marketId: null,
          requestTime: now(),
        });
        throw error;
      }

      const byYoutubeId = new Map(result.items.map((item) => [item.videoId, item]));
      const collectedAt = now();
      let snapshotted = 0;
      let unavailable = 0;

      for (const video of dueVideos) {
        const apiItem = byYoutubeId.get(video.youtubeVideoId);
        const currentState = video.monitoringState as MonitoringState;

        if (!apiItem) {
          const newState = nextMonitoringState(currentState, "not_found");
          await updateVideoMonitoringState(deps.db, video.id, {
            monitoringState: newState,
            lastSnapshotAt: video.lastSnapshotAt,
            nextSnapshotDueAt: computeNextSnapshotDueAt(newState, video.publishedAt, collectedAt),
          });
          unavailable += 1;
          continue;
        }

        await insertVideoSnapshot(deps.db, {
          videoId: video.id,
          collectedAt,
          viewCount: apiItem.viewCount !== undefined ? BigInt(apiItem.viewCount) : null,
          likeCount: apiItem.likeCount !== undefined ? BigInt(apiItem.likeCount) : null,
          commentCount: apiItem.commentCount !== undefined ? BigInt(apiItem.commentCount) : null,
          fetchStatus: "ok",
          source: "videos.list",
        });

        const newState = nextMonitoringState(currentState, "success");
        await updateVideoMonitoringState(deps.db, video.id, {
          monitoringState: newState,
          lastSnapshotAt: collectedAt,
          nextSnapshotDueAt: computeNextSnapshotDueAt(newState, video.publishedAt, collectedAt),
        });
        snapshotted += 1;
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: snapshotted,
        errorMessage: null,
      });
      return { snapshotted, unavailable };
    } catch (error) {
      const message = error instanceof YouTubeApiError ? `${error.code}: ${error.message}` : String(error);
      log.error({ status: "error", errorCode: error instanceof YouTubeApiError ? error.code : "unknown" }, message);
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
