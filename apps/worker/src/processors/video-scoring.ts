import type { Job } from "bullmq";
import {
  finishJobRun,
  insertVideoScore,
  listChannelPeerViews,
  listRecentValidSnapshots,
  listVideosEligibleForScoring,
  startJobRun,
  updateVideoMonitoringState,
  type ChannelPeerView,
  type ScoringEligibleVideo,
  type VideoSnapshot,
} from "@yvi/db";
import { computeNextSnapshotDueAt, QUEUE_NAMES, type MonitoringState, type VideoScoringJobData } from "@yvi/shared";
import {
  ageBucketLabel,
  computeAcceleration,
  computeChannelOutlierMultiplier,
  computeGrowthPct,
  computeRecencyScore,
  computeViralScore,
  computeVph,
  logTransform,
  median,
  meetsViralCandidateThreshold,
  nextScoreDrivenState,
  percentileRank,
  percentileValue,
  type ViralScoreComponents,
} from "@yvi/scoring";
import type { ProcessorDeps } from "./deps";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bounds quota-free DB work per tick, same role as `video-monitoring`'s `MAX_VIDEOS_PER_TICK`. */
const MAX_VIDEOS_PER_TICK = 200;

/** PRD §8.1F `tau`: a first-cut constant (plan Risks — "Score cần được hiệu chỉnh sau khi có lịch sử dữ liệu"), not yet calibrated against real data. */
const RECENCY_TAU_HOURS = 24;

/** PRD §8.1E — below this many comparable channel videos, fall back to the subscriber-based formula instead of a thin/unstable median. */
const MIN_COMPARABLE_CHANNEL_VIDEOS = 5;

/** Fetched per distinct channel so the scored video itself can be excluded in memory and up to 20 peers still remain. */
const CHANNEL_PEER_FETCH_LIMIT = 21;
const CHANNEL_PEER_LIMIT = 20;

interface VideoMetrics {
  video: ScoringEligibleVideo;
  ageDays: number;
  cohortKey: string;
  validSnapshotCount: number;
  vph: number | null;
  vphLog: number | null;
  growthPct: number;
  growthLog: number;
  acceleration: number | null;
  outlierMultiplier: number | null;
  outlierLog: number | null;
  recencyScore100: number;
}

interface Cohort {
  vphRawAscending: number[];
  vphLog: number[];
  growthLog: number[];
  outlierLog: number[];
  acceleration: number[];
}

/**
 * Groups snapshots (already ordered `[{videoId:"asc"},{collectedAt:"desc"}]`
 * by `listRecentValidSnapshots`) by video id, newest first within each group.
 */
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

/**
 * Per-video raw metrics (PRD §8.1), before cohort-relative normalization.
 * Returns `null` when the video has fewer than 2 valid snapshots — such a
 * video is skipped entirely (no `VideoScore` row), matching the plan
 * Validation: "correctly skips videos with fewer than 2 valid snapshots."
 *
 * A VPH anomaly (negative delta — PRD §8.1B: a correction, not real negative
 * growth) zeroes out both this video's own VPH-derived components and its
 * contribution to other videos' cohort ranking, and forces Acceleration to
 * null for this interval — a bad delta cannot be trusted as a rate either.
 */
function computeRawMetrics(
  video: ScoringEligibleVideo,
  snapshotsDesc: VideoSnapshot[],
  now: Date,
  channelPeersByChannel: Map<string, ChannelPeerView[]>,
): VideoMetrics | null {
  const validSnapshotCount = snapshotsDesc.length;
  if (validSnapshotCount < 2) {
    return null;
  }

  const [curr, prev, prevPrev] = snapshotsDesc;
  const currViews = Number(curr.viewCount ?? 0);
  const prevViews = Number(prev.viewCount ?? 0);

  const currentInterval = computeVph(prevViews, currViews, prev.collectedAt, curr.collectedAt);
  const growthPct = computeGrowthPct(prevViews, currViews);

  let acceleration: number | null = null;
  if (prevPrev && !currentInterval.isAnomaly) {
    const prevPrevViews = Number(prevPrev.viewCount ?? 0);
    const previousInterval = computeVph(prevPrevViews, prevViews, prevPrev.collectedAt, prev.collectedAt);
    if (!previousInterval.isAnomaly) {
      acceleration = computeAcceleration(currentInterval.vph, previousInterval.vph);
    }
  }

  const currentViews = video.currentViewCount !== null ? Number(video.currentViewCount) : null;
  let outlier: { multiplier: number; usedFallback: boolean } | null = null;
  if (currentViews !== null) {
    const peers = video.channelId ? channelPeersByChannel.get(video.channelId) ?? [] : [];
    const peerViews = peers.filter((peer) => peer.videoId !== video.id).slice(0, CHANNEL_PEER_LIMIT).map((peer) => Number(peer.currentViewCount));
    const channelMedianViews = peerViews.length >= MIN_COMPARABLE_CHANNEL_VIDEOS ? median(peerViews) : null;
    const subscriberCount = video.channelSubscriberCount !== null ? Number(video.channelSubscriberCount) : null;
    outlier = computeChannelOutlierMultiplier(currentViews, channelMedianViews, subscriberCount);
  }

  const ageDays = (now.getTime() - video.publishedAt.getTime()) / DAY_MS;
  const ageHours = ageDays * 24;

  return {
    video,
    ageDays,
    cohortKey: `${video.formatClassification}|${ageBucketLabel(ageDays)}`,
    validSnapshotCount,
    vph: currentInterval.isAnomaly ? null : currentInterval.vph,
    vphLog: currentInterval.isAnomaly ? null : logTransform(currentInterval.vph),
    growthPct,
    growthLog: logTransform(growthPct),
    acceleration,
    outlierMultiplier: outlier?.multiplier ?? null,
    outlierLog: outlier ? logTransform(outlier.multiplier) : null,
    recencyScore100: computeRecencyScore(ageHours, RECENCY_TAU_HOURS) * 100,
  };
}

function buildCohorts(allMetrics: VideoMetrics[]): Map<string, Cohort> {
  const cohorts = new Map<string, Cohort>();
  for (const metrics of allMetrics) {
    let cohort = cohorts.get(metrics.cohortKey);
    if (!cohort) {
      cohort = { vphRawAscending: [], vphLog: [], growthLog: [], outlierLog: [], acceleration: [] };
      cohorts.set(metrics.cohortKey, cohort);
    }
    if (metrics.vph !== null && metrics.vphLog !== null) {
      cohort.vphRawAscending.push(metrics.vph);
      cohort.vphLog.push(metrics.vphLog);
    }
    cohort.growthLog.push(metrics.growthLog);
    if (metrics.outlierLog !== null) {
      cohort.outlierLog.push(metrics.outlierLog);
    }
    if (metrics.acceleration !== null) {
      cohort.acceleration.push(metrics.acceleration);
    }
  }
  for (const cohort of cohorts.values()) {
    cohort.vphRawAscending.sort((a, b) => a - b);
  }
  return cohorts;
}

/**
 * One tick = select scoring-eligible videos, build in-memory comparison
 * cohorts (format + age bucket, PRD §8.2 — see plan Decisions), score each
 * video (§8.3), apply §8.4's candidate threshold and the score-driven
 * lifecycle transition, and persist. No YouTube API calls, so no quota
 * guard (plan Context). Creates its own JobRun keyed by the BullMQ job's
 * own id, same pattern as `video-monitoring.ts`.
 */
export function createVideoScoringProcessor(deps: ProcessorDeps) {
  return async function processVideoScoring(
    job: Job<VideoScoringJobData>,
  ): Promise<{ scored: number; skippedInsufficientData: number; stateChanged: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.videoScoring });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.videoScoring,
      startedAt,
    });

    try {
      const eligibleVideos = await listVideosEligibleForScoring(deps.db, MAX_VIDEOS_PER_TICK);
      if (eligibleVideos.length === 0) {
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "completed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: 0,
          errorMessage: null,
        });
        return { scored: 0, skippedInsufficientData: 0, stateChanged: 0 };
      }

      const videoIds = eligibleVideos.map((video) => video.id);
      const snapshotsByVideo = groupSnapshotsByVideo(await listRecentValidSnapshots(deps.db, videoIds));

      const channelIds = [...new Set(eligibleVideos.map((video) => video.channelId).filter((id): id is string => id !== null))];
      const channelPeerEntries = await Promise.all(
        channelIds.map(async (channelId) => [channelId, await listChannelPeerViews(deps.db, channelId, CHANNEL_PEER_FETCH_LIMIT)] as const),
      );
      const channelPeersByChannel = new Map(channelPeerEntries);

      const scoreTime = now();
      const allMetrics: VideoMetrics[] = [];
      let skippedInsufficientData = 0;

      for (const video of eligibleVideos) {
        const snapshotsDesc = snapshotsByVideo.get(video.id) ?? [];
        const metrics = computeRawMetrics(video, snapshotsDesc, scoreTime, channelPeersByChannel);
        if (metrics === null) {
          skippedInsufficientData += 1;
          continue;
        }
        allMetrics.push(metrics);
      }

      const cohorts = buildCohorts(allMetrics);
      let scored = 0;
      let stateChanged = 0;

      for (const metrics of allMetrics) {
        const cohort = cohorts.get(metrics.cohortKey);
        if (!cohort) {
          continue;
        }

        const components: ViralScoreComponents = {
          vphPercentile: metrics.vphLog !== null ? percentileRank(metrics.vphLog, cohort.vphLog) * 100 : null,
          growthPercentile: percentileRank(metrics.growthLog, cohort.growthLog) * 100,
          outlierPercentile: metrics.outlierLog !== null ? percentileRank(metrics.outlierLog, cohort.outlierLog) * 100 : null,
          recencyScore100: metrics.recencyScore100,
          accelerationPercentile: metrics.acceleration !== null ? percentileRank(metrics.acceleration, cohort.acceleration) * 100 : null,
        };
        const result = computeViralScore(components);

        await insertVideoScore(deps.db, {
          videoId: metrics.video.id,
          computedAt: scoreTime,
          viralScore: result.viralScore,
          scoreBreakdown: result.breakdown,
          dataConfidence: result.dataConfidence,
        });
        scored += 1;

        const vphP90 = cohort.vphRawAscending.length > 0 ? percentileValue(cohort.vphRawAscending, 0.9) : Infinity;
        const meetsHighSignalThreshold =
          metrics.vph !== null &&
          meetsViralCandidateThreshold({
            vph: metrics.vph,
            vphP90,
            outlierMultiplier: metrics.outlierMultiplier,
            validSnapshotCount: metrics.validSnapshotCount,
            ageDays: metrics.ageDays,
          });
        // PRD §8.5 "VPH giảm liên tục" — this phase uses a single-interval decline (plan Risks); no prior
        // interval (acceleration null) is treated as "not declining," never inferred from absence of data.
        const isDeclining = metrics.acceleration !== null && metrics.acceleration < 0;

        const currentState = metrics.video.monitoringState as MonitoringState;
        const newState = nextScoreDrivenState(currentState, { meetsHighSignalThreshold, isDeclining });
        if (newState !== currentState) {
          await updateVideoMonitoringState(deps.db, metrics.video.id, {
            monitoringState: newState,
            lastSnapshotAt: metrics.video.lastSnapshotAt,
            nextSnapshotDueAt: computeNextSnapshotDueAt(newState, metrics.video.publishedAt, scoreTime),
          });
          stateChanged += 1;
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
      return { scored, skippedInsufficientData, stateChanged };
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
