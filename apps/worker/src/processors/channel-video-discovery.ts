import type { Job } from "bullmq";
import {
  finishJobRun,
  listChannelsDueForVideoDiscovery,
  listKnownYoutubeVideoIds,
  recordApiUsage,
  startJobRun,
  updateChannelLastVideoDiscoveryAt,
} from "@yvi/db";
import { QUOTA_COST, YouTubeApiError } from "@yvi/youtube-client";
import { QUEUE_NAMES, type ChannelVideoDiscoveryJobData, type VideoEnrichmentCandidate } from "@yvi/shared";
import { enqueueWithJobRun } from "../job-helpers";
import type { ProcessorDeps } from "./deps";
import { checkQuotaGuard } from "./quota";

const ENDPOINT = "playlistItems.list";

/** Caps how many due channels a single tick polls, bounding quota spend per tick (same role as `video-monitoring`'s `MAX_VIDEOS_PER_TICK`). */
const MAX_CHANNELS_PER_TICK = 50;

/** How many of a channel's most recent uploads to inspect per poll (PRD §9.5) — recent uploads are what a channel-intelligence discovery cares about, not full back-catalog backfill. */
const MAX_RESULTS_PER_PLAYLIST = 20;

/**
 * One tick = for each channel due for an uploads-playlist poll (PRD §9.5),
 * one quota-guarded `playlistItems.list` call, diff the returned video ids
 * against what's already known, and fan genuinely-new ids onto the existing
 * `video-enrichment` queue (not a separate enrichment path — a
 * channel-uploads-sourced video goes through the same enrichment/scoring
 * pipeline as a discovery-sourced one, just with `marketId`/`discoveryQueryId`
 * null, per the widened `VideoEnrichmentJobData` shape, plan Decisions).
 *
 * A single channel's playlistItems.list failure is logged and skipped —
 * it does not abort the rest of the tick's channels, since each channel's
 * poll is independent (unlike video-monitoring's one-batched-call-for-many-
 * videos shape, where a single failure fails the whole tick by construction).
 *
 * Creates its own JobRun keyed by the BullMQ job's own id, same pattern as
 * `video-monitoring.ts`/`video-scoring.ts`.
 */
export function createChannelVideoDiscoveryProcessor(deps: ProcessorDeps) {
  return async function processChannelVideoDiscovery(
    job: Job<ChannelVideoDiscoveryJobData>,
  ): Promise<{ channelsPolled: number; videosEnqueued: number; channelsFailed: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.channelVideoDiscovery });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.channelVideoDiscovery,
      startedAt,
    });

    const dueChannels = await listChannelsDueForVideoDiscovery(deps.db, MAX_CHANNELS_PER_TICK);
    if (dueChannels.length === 0) {
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: 0,
        errorMessage: null,
      });
      return { channelsPolled: 0, videosEnqueued: 0, channelsFailed: 0 };
    }

    const guard = await checkQuotaGuard(deps.db, QUOTA_COST.playlist_items_list * dueChannels.length, startedAt);
    if (!guard.allowed) {
      log.warn({ status: "blocked", quotaEstimate: guard.projectedUsage }, "quota guard blocked channel-video-discovery run");
      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "failed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: null,
        errorMessage: `quota guard: projected usage ${guard.projectedUsage} exceeds daily budget`,
      });
      return { channelsPolled: 0, videosEnqueued: 0, channelsFailed: 0 };
    }

    let videosEnqueued = 0;
    let channelsFailed = 0;

    for (const channel of dueChannels) {
      const polledAt = now();
      try {
        const result = await deps.youtube.listPlaylistItems(channel.uploadsPlaylistId, MAX_RESULTS_PER_PLAYLIST);
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.playlist_items_list,
          status: "success",
          marketId: null,
          requestTime: polledAt,
        });

        const candidateIds = result.items.map((item) => item.videoId);
        const knownIds = await listKnownYoutubeVideoIds(deps.db, candidateIds);
        const newItems = result.items.filter((item) => !knownIds.has(item.videoId));

        if (newItems.length > 0) {
          const items: VideoEnrichmentCandidate[] = newItems.map((item) => ({ videoId: item.videoId, sourceRank: item.position }));
          await enqueueWithJobRun(
            deps.db,
            deps.queues.videoEnrichment,
            "video-enrichment",
            {
              marketId: null,
              discoveryQueryId: null,
              source: "channel_uploads",
              discoveredAt: polledAt.toISOString(),
              items,
            },
            `${jobRun.id}:${channel.id}`,
          );
          videosEnqueued += newItems.length;
        }

        await updateChannelLastVideoDiscoveryAt(deps.db, channel.id, polledAt);
      } catch (error) {
        await recordApiUsage(deps.db, {
          endpoint: ENDPOINT,
          quotaEstimate: QUOTA_COST.playlist_items_list,
          status: "error",
          marketId: null,
          requestTime: polledAt,
        });
        const message = error instanceof YouTubeApiError ? `${error.code}: ${error.message}` : String(error);
        log.error({ status: "error", channelId: channel.id, errorCode: error instanceof YouTubeApiError ? error.code : "unknown" }, message);
        channelsFailed += 1;
      }
    }

    await finishJobRun(deps.db, {
      id: jobRun.id,
      status: "completed",
      finishedAt: now(),
      durationMs: now().getTime() - startedAt.getTime(),
      resultCount: videosEnqueued,
      errorMessage: null,
    });
    return { channelsPolled: dueChannels.length, videosEnqueued, channelsFailed };
  };
}
