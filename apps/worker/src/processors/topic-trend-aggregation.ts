import type { Job } from "bullmq";
import {
  finishJobRun,
  getLatestTrendSnapshot,
  listEnabledMarkets,
  listObservedTopicVideos,
  startJobRun,
  upsertTrendSnapshot,
  type ObservedTopicVideoRow,
} from "@yvi/db";
import {
  computeGrowthPct,
  computeRecencyScore,
  computeTopicMomentum,
  computeVphSincePublish,
  nextTopicLifecycleState,
  percentileRank,
  summarizeTopicVph,
  type TopicLifecycleState,
  type TopicMomentumComponents,
} from "@yvi/scoring";
import { QUEUE_NAMES, type TopicTrendAggregationJobData } from "@yvi/shared";
import type { ProcessorDeps } from "./deps";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** PRD §10.5: per enabled market x topic with >=1 observed video in a trailing 7-day window. */
const TREND_WINDOW_MS = 7 * DAY_MS;

/** First-cut constant (plan Risks, same caveat as the other scoring ticks' tau constants): a topic's own upload recency decays over about two days, not a single day — most-popular topics upload multiple times a day. */
const TOPIC_RECENCY_TAU_HOURS = 48;

interface TopicGroupKey {
  marketId: string;
  topicId: string;
}

interface TopicGroupRawMetrics extends TopicGroupKey {
  uniqueVideoCount: number;
  uniqueChannelCount: number;
  totalObservedViews: bigint | null;
  medianVph: number;
  p90Vph: number;
  outlierVideoCount: number;
  outlierRatioScore100: number;
  channelBreadthScore100: number;
  recencyScore100: number;
  previousUniqueVideoCount: number | null;
  previousMomentumScore: number | null;
  previousLifecycleState: TopicLifecycleState | null;
}

function groupKeyOf(row: ObservedTopicVideoRow): string {
  return `${row.marketId}|${row.topicId}`;
}

/** Same grouping shape as `channel-scoring.ts`'s `groupSnapshotsByVideo`. */
function groupObservedVideos(rows: ObservedTopicVideoRow[]): Map<string, ObservedTopicVideoRow[]> {
  const byGroup = new Map<string, ObservedTopicVideoRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const group = byGroup.get(key);
    if (group) {
      group.push(row);
    } else {
      byGroup.set(key, [row]);
    }
  }
  return byGroup;
}

async function computeGroupRawMetrics(
  deps: ProcessorDeps,
  marketId: string,
  topicId: string,
  rows: ObservedTopicVideoRow[],
  now: Date,
): Promise<TopicGroupRawMetrics> {
  const uniqueChannelCount = new Set(rows.map((row) => row.channelId)).size;

  let totalObservedViews: bigint | null = null;
  const vphValues: number[] = [];
  let mostRecentPublishedAt: Date | null = null;

  for (const row of rows) {
    if (mostRecentPublishedAt === null || row.publishedAt > mostRecentPublishedAt) {
      mostRecentPublishedAt = row.publishedAt;
    }
    if (row.currentViewCount !== null) {
      totalObservedViews = (totalObservedViews ?? 0n) + row.currentViewCount;
      const ageHoursSincePublished = (now.getTime() - row.publishedAt.getTime()) / HOUR_MS;
      vphValues.push(computeVphSincePublish(Number(row.currentViewCount), ageHoursSincePublished));
    }
  }

  const { medianVph, p90Vph, outlierVideoCount } = summarizeTopicVph(vphValues);
  const outlierRatioScore100 = rows.length > 0 ? (outlierVideoCount / rows.length) * 100 : 0;
  const channelBreadthScore100 = rows.length > 0 ? Math.min(100, (uniqueChannelCount / rows.length) * 100) : 0;
  const ageHoursSinceNewest = mostRecentPublishedAt !== null ? (now.getTime() - mostRecentPublishedAt.getTime()) / HOUR_MS : Infinity;
  const recencyScore100 = computeRecencyScore(ageHoursSinceNewest, TOPIC_RECENCY_TAU_HOURS) * 100;

  const previous = await getLatestTrendSnapshot(deps.db, marketId, topicId);

  return {
    marketId,
    topicId,
    uniqueVideoCount: rows.length,
    uniqueChannelCount,
    totalObservedViews,
    medianVph,
    p90Vph,
    outlierVideoCount,
    outlierRatioScore100,
    channelBreadthScore100,
    recencyScore100,
    previousUniqueVideoCount: previous?.uniqueVideoCount ?? null,
    previousMomentumScore: previous !== null ? Number(previous.momentumScore) : null,
    previousLifecycleState: (previous?.lifecycleState as TopicLifecycleState | undefined) ?? null,
  };
}

/**
 * One tick = select every video observed in the trailing 7-day window (PRD
 * §10.5), restrict to enabled markets, group by (market, topic), compute raw
 * §10.5 metrics per group, percentile-rank `medianVph` and video-count growth
 * across the tick's own global cohort (same simplification as
 * `channel-scoring.ts`: PRD §10.5/§10.6 name no topic sub-cohort dimension),
 * derive the outlier/breadth ratios and recency score directly (bounded 0-100
 * ratios, not percentile-ranked — a deliberate, documented difference from
 * the percentile-ranked components), run `computeTopicMomentum` and
 * `nextTopicLifecycleState` off the prior snapshot for that (market, topic),
 * and upsert `trend_snapshots`. No YouTube/Gemini calls, so no quota/AI-budget
 * guard — same as `video-scoring.ts`/`channel-scoring.ts`.
 */
export function createTopicTrendAggregationProcessor(deps: ProcessorDeps) {
  return async function processTopicTrendAggregation(
    job: Job<TopicTrendAggregationJobData>,
  ): Promise<{ aggregated: number; lifecycleChanged: number }> {
    const now = deps.now ?? (() => new Date());
    const startedAt = now();
    const log = deps.logger.child({ jobId: job.id, queue: QUEUE_NAMES.topicTrendAggregation });

    const jobRun = await startJobRun(deps.db, {
      id: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.topicTrendAggregation,
      startedAt,
    });

    try {
      const windowEnd = startedAt;
      const windowStart = new Date(windowEnd.getTime() - TREND_WINDOW_MS);

      const [observedRows, enabledMarkets] = await Promise.all([
        listObservedTopicVideos(deps.db, windowStart, windowEnd),
        listEnabledMarkets(deps.db),
      ]);
      const enabledMarketIds = new Set(enabledMarkets.map((market) => market.id));
      const rowsInEnabledMarkets = observedRows.filter((row) => enabledMarketIds.has(row.marketId));

      const groups = groupObservedVideos(rowsInEnabledMarkets);
      if (groups.size === 0) {
        await finishJobRun(deps.db, {
          id: jobRun.id,
          status: "completed",
          finishedAt: now(),
          durationMs: now().getTime() - startedAt.getTime(),
          resultCount: 0,
          errorMessage: null,
        });
        return { aggregated: 0, lifecycleChanged: 0 };
      }

      const allMetrics: TopicGroupRawMetrics[] = [];
      for (const [key, rows] of groups) {
        const [marketId, topicId] = key.split("|");
        allMetrics.push(await computeGroupRawMetrics(deps, marketId, topicId, rows, windowEnd));
      }

      const medianVphs = allMetrics.map((m) => m.medianVph);
      const growthPcts = allMetrics
        .filter((m) => m.previousUniqueVideoCount !== null)
        .map((m) => computeGrowthPct(m.previousUniqueVideoCount as number, m.uniqueVideoCount));

      let aggregated = 0;
      let lifecycleChanged = 0;

      for (const metrics of allMetrics) {
        const growthPct = metrics.previousUniqueVideoCount !== null ? computeGrowthPct(metrics.previousUniqueVideoCount, metrics.uniqueVideoCount) : null;

        const components: TopicMomentumComponents = {
          viewVelocityPercentile: percentileRank(metrics.medianVph, medianVphs) * 100,
          videoCountGrowthPercentile: growthPct !== null ? percentileRank(growthPct, growthPcts) * 100 : null,
          outlierRatioScore100: metrics.outlierRatioScore100,
          channelBreadthScore100: metrics.channelBreadthScore100,
          recencyScore100: metrics.recencyScore100,
        };
        const momentum = computeTopicMomentum(components, metrics.uniqueVideoCount);

        // Single-interval decline (same simplification as channel/video scoring): no prior
        // snapshot is treated as "not declining," never inferred from absence of history.
        const isDeclining = metrics.previousMomentumScore !== null && momentum.momentumScore < metrics.previousMomentumScore;
        const currentState: TopicLifecycleState = metrics.previousLifecycleState ?? "candidate";
        const nextState = nextTopicLifecycleState({
          momentumScore: momentum.momentumScore,
          sampleConfidence: momentum.sampleConfidence,
          isDeclining,
          currentState,
        });
        if (nextState !== currentState) {
          lifecycleChanged += 1;
        }

        await upsertTrendSnapshot(deps.db, {
          marketId: metrics.marketId,
          topicId: metrics.topicId,
          windowStart,
          windowEnd,
          uniqueVideoCount: metrics.uniqueVideoCount,
          uniqueChannelCount: metrics.uniqueChannelCount,
          totalObservedViews: metrics.totalObservedViews,
          medianVph: metrics.medianVph,
          p90Vph: metrics.p90Vph,
          outlierVideoCount: metrics.outlierVideoCount,
          momentumScore: momentum.momentumScore,
          sampleConfidence: momentum.sampleConfidence,
          scoreBreakdown: momentum.breakdown,
          lifecycleState: nextState,
        });
        aggregated += 1;
      }

      await finishJobRun(deps.db, {
        id: jobRun.id,
        status: "completed",
        finishedAt: now(),
        durationMs: now().getTime() - startedAt.getTime(),
        resultCount: aggregated,
        errorMessage: null,
      });
      return { aggregated, lifecycleChanged };
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
