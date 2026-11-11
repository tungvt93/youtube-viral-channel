import type { Job } from "bullmq";
import {
  createAlertIfDue,
  finishJobRun,
  getLatestChannelScore,
  insertChannelScore,
  listChannelsEligibleForScoring,
  listChannelVideosForScoring,
  listRecentValidSnapshots,
  startJobRun,
  updateChannelTier,
  type ChannelVideoForScoring,
  type ScoringEligibleChannel,
  type VideoSnapshot,
} from "@yvi/db";
import { QUEUE_NAMES, type ChannelScoringJobData } from "@yvi/shared";
import {
  computeChannelMedianViews,
  computeChannelOutlierMultiplier,
  computeChannelOutlierScore,
  computeChannelRecencyScore,
  computeChannelRecentMedianVph,
  computeUploadConsistencyScore,
  nextChannelTier,
  percentileRank,
  type ChannelOutlierScoreComponents,
  type ChannelTier,
  type ChannelVphSnapshotPair,
} from "@yvi/scoring";
import type { ProcessorDeps } from "./deps";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Bounds quota-free DB work per tick, same role as `video-scoring`'s `MAX_VIDEOS_PER_TICK`. */
const MAX_CHANNELS_PER_TICK = 100;

/**
 * PRD §9.3 OutlierVideoRatio: reuses the exact `>= 3` multiplier threshold
 * `meetsViralCandidateThreshold` already applies at video scope (plan
 * Decisions, 2026-11-05) — a video counts as a channel outlier when it's
 * at least 3x the channel's own median views.
 */
const CHANNEL_OUTLIER_MULTIPLIER_THRESHOLD = 3;

/**
 * First-cut constant (plan Risks, same caveat as video scoring's
 * `RECENCY_TAU_HOURS`): channel upload-recency decays over roughly a week,
 * not a single day — a channel that uploaded yesterday and one that
 * uploaded last week shouldn't score wildly differently on this axis alone.
 */
const CHANNEL_RECENCY_TAU_HOURS = 7 * 24;

/** PRD §11.7 "chống gửi trùng bằng ... cooldown" — a task-local default (plan Decisions), not PRD-specified. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface ChannelRawMetrics {
  channel: ScoringEligibleChannel;
  channelAgeDays: number;
  outlierVideoRatio: number | null;
  recentMedianVph: number | null;
  uploadConsistencyScore: number | null;
  channelRecencyScore: number;
}

/** Same grouping shape as `video-scoring.ts`'s `groupSnapshotsByVideo`. */
function groupSnapshotsByVideo(snapshots: VideoSnapshot[]): Map<string, VideoSnapshot[]> {
  const byVideo = new Map<string, VideoSnapshot[]>();
  for (const snapshot of snapshots) {
    const group = byVideo.get(snapshot.videoId);
    if (group) {
      group.push(snapshot);
    } else {
      byVideo.set(snapshot.videoId, [snapshot]);
    }
  }
  return byVideo;
}

function computeChannelRawMetrics(
  channel: ScoringEligibleChannel,
  videos: ChannelVideoForScoring[],
  snapshotsByVideo: Map<string, VideoSnapshot[]>,
  now: Date,
): ChannelRawMetrics {
  const channelAgeDays = (now.getTime() - channel.firstDiscoveredAt.getTime()) / DAY_MS;

  const viewedVideos = videos.filter((video): video is ChannelVideoForScoring & { currentViewCount: bigint } => video.currentViewCount !== null);
  const channelMedianViews = computeChannelMedianViews(viewedVideos.map((video) => Number(video.currentViewCount)));

  let outlierVideoRatio: number | null = null;
  if (channelMedianViews !== null && viewedVideos.length > 0) {
    const outlierCount = viewedVideos.filter((video) => {
      const result = computeChannelOutlierMultiplier(Number(video.currentViewCount), channelMedianViews, null);
      return result !== null && result.multiplier >= CHANNEL_OUTLIER_MULTIPLIER_THRESHOLD;
    }).length;
    outlierVideoRatio = outlierCount / viewedVideos.length;
  }

  const vphPairs: ChannelVphSnapshotPair[] = [];
  for (const video of videos) {
    const snapshotsDesc = snapshotsByVideo.get(video.id) ?? [];
    if (snapshotsDesc.length < 2) {
      continue;
    }
    const [curr, prev] = snapshotsDesc;
    vphPairs.push({
      prevViews: Number(prev.viewCount ?? 0),
      currViews: Number(curr.viewCount ?? 0),
      prevAt: prev.collectedAt,
      currAt: curr.collectedAt,
    });
  }
  const recentMedianVph = computeChannelRecentMedianVph(vphPairs);

  const uploadConsistencyScore = computeUploadConsistencyScore(videos.map((video) => video.publishedAt));

  const mostRecentUpload = videos.reduce<Date | null>(
    (latest, video) => (latest === null || video.publishedAt > latest ? video.publishedAt : latest),
    null,
  );
  const ageHoursSinceLastUpload = mostRecentUpload !== null ? (now.getTime() - mostRecentUpload.getTime()) / HOUR_MS : Infinity;
  const channelRecencyScore = computeChannelRecencyScore(ageHoursSinceLastUpload, CHANNEL_RECENCY_TAU_HOURS);

  return { channel, channelAgeDays, outlierVideoRatio, recentMedianVph, uploadConsistencyScore, channelRecencyScore };
}

/**
 * One tick = select scoring-eligible channels, compute each channel's raw
 * §9.3 metrics, percentile-rank the two ratio-shaped metrics against a
 * single global cohort (every eligible channel scored this tick — PRD §9.3
 * names no sub-cohort dimension analogous to video scoring's format/age
 * bucket, plan Decisions), compose the Channel Outlier Score, persist it,
 * and apply the tier state machine. No YouTube API calls, so no quota
 * guard — same as `video-scoring.ts`.
 */
export function createChannelScoringProcessor(deps: ProcessorDeps) {
  return async function processChannelScoring(
    job: Job<ChannelScoringJobData>,
  ): Promise<{ scored: number; tierChanged: number; alertsCreated: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.channelScoring });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.channelScoring,
      startedAt,
    });

    try {
      const eligibleChannels = await listChannelsEligibleForScoring(deps.db, MAX_CHANNELS_PER_TICK);
      if (eligibleChannels.length === 0) {
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "completed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: 0,
          errorMessage: null,
        });
        return { scored: 0, tierChanged: 0, alertsCreated: 0 };
      }

      const scoreTime = now();
      const allMetrics: ChannelRawMetrics[] = [];
      for (const channel of eligibleChannels) {
        const videos = await listChannelVideosForScoring(deps.db, channel.id);
        const videoIds = videos.map((video) => video.id);
        const snapshotsByVideo = groupSnapshotsByVideo(await listRecentValidSnapshots(deps.db, videoIds));
        allMetrics.push(computeChannelRawMetrics(channel, videos, snapshotsByVideo, scoreTime));
      }

      const outlierVideoRatios = allMetrics.map((m) => m.outlierVideoRatio).filter((v): v is number => v !== null);
      const recentMedianVphs = allMetrics.map((m) => m.recentMedianVph).filter((v): v is number => v !== null);

      let scored = 0;
      let tierChanged = 0;
      let alertsCreated = 0;

      for (const metrics of allMetrics) {
        const components: ChannelOutlierScoreComponents = {
          outlierVideoRatioPercentile: metrics.outlierVideoRatio !== null ? percentileRank(metrics.outlierVideoRatio, outlierVideoRatios) * 100 : null,
          recentMedianVphPercentile: metrics.recentMedianVph !== null ? percentileRank(metrics.recentMedianVph, recentMedianVphs) * 100 : null,
          uploadConsistencyScore: metrics.uploadConsistencyScore,
          channelRecencyScore: metrics.channelRecencyScore,
        };
        const result = computeChannelOutlierScore(components);

        const previousScore = await getLatestChannelScore(deps.db, metrics.channel.id);

        await insertChannelScore(deps.db, {
          channelId: metrics.channel.id,
          computedAt: scoreTime,
          channelScore: result.channelOutlierScore,
          scoreBreakdown: result.breakdown,
          dataConfidence: result.dataConfidence,
        });
        scored += 1;

        // Single-interval decline (same simplification as video scoring's PRD §8.5 note): no prior
        // score is treated as "not declining," never inferred from absence of history.
        const isDeclining = previousScore !== null && result.channelOutlierScore < Number(previousScore.channelScore);

        const newTier = nextChannelTier({
          channelOutlierScore: result.channelOutlierScore,
          isDeclining,
          channelAgeDays: metrics.channelAgeDays,
          currentTier: metrics.channel.channelTier as ChannelTier,
        });
        if (newTier !== metrics.channel.channelTier) {
          await updateChannelTier(deps.db, metrics.channel.id, newTier);
          tierChanged += 1;

          if (newTier === "breakout") {
            const created = await createAlertIfDue(
              deps.db,
              {
                alertType: "channel_breakout",
                entityType: "channel",
                entityId: metrics.channel.id,
                message: `"${metrics.channel.title}" broke out`,
                severity: "info",
                triggeredAt: scoreTime,
              },
              ALERT_COOLDOWN_MS,
            );
            if (created) {
              alertsCreated += 1;
            }
          }
        }
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: scored,
        errorMessage: null,
      });
      return { scored, tierChanged, alertsCreated };
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
