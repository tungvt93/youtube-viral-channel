import type { PrismaClient, TrendSnapshot } from "../../generated/client";

export interface ObservedTopicVideoRow {
  marketId: string;
  topicId: string;
  topicName: string;
  videoId: string;
  channelId: string;
  currentViewCount: bigint | null;
  publishedAt: Date;
}

/**
 * Raw per-(market, resolved-topic, video) observations for every video
 * published in `[windowStart, windowEnd)` that has both a topic
 * classification and at least one market-attributed discovery event.
 *
 * Two real, documented data-model limitations (not silently papered over):
 *  - A video's market is read from `discovery_events.market_id`, which is
 *    `NULL` for videos discovered via the channel-video-discovery /
 *    video-monitoring paths (see those processors). Such videos are
 *    excluded from every topic-trend snapshot, not attributed to a
 *    fallback market — Phase 5 scope is per-market search-discovered
 *    trends, not every known video.
 *  - `merged_into_topic_id` chains are resolved here, in the one place that
 *    reads `video_topics` for aggregation (plan Risk: "implement it once in
 *    the trend-aggregation query, not ad hoc per caller") via a recursive
 *    CTE, so a video classified into a topic before it was merged still
 *    counts toward the merge target's trend.
 */
export async function listObservedTopicVideos(
  db: PrismaClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<ObservedTopicVideoRow[]> {
  return db.$queryRawUnsafe<ObservedTopicVideoRow[]>(
    `
    WITH RECURSIVE topic_root(id, root_id) AS (
      SELECT id, id AS root_id FROM topics WHERE merged_into_topic_id IS NULL
      UNION ALL
      SELECT t.id, tr.root_id
      FROM topics t
      JOIN topic_root tr ON t.merged_into_topic_id = tr.id
    )
    SELECT DISTINCT
      de.market_id AS "marketId",
      tr.root_id AS "topicId",
      root_topic.canonical_name AS "topicName",
      v.id AS "videoId",
      v.channel_id AS "channelId",
      v.current_view_count AS "currentViewCount",
      v.published_at AS "publishedAt"
    FROM video_topics vt
    JOIN topic_root tr ON tr.id = vt.topic_id
    JOIN topics root_topic ON root_topic.id = tr.root_id
    JOIN videos v ON v.id = vt.video_id
    JOIN discovery_events de ON de.video_id = v.id
    WHERE de.market_id IS NOT NULL
      AND v.channel_id IS NOT NULL
      AND v.published_at >= $1::timestamptz
      AND v.published_at < $2::timestamptz
    `,
    windowStart,
    windowEnd,
  );
}

export interface UpsertTrendSnapshotInput {
  marketId: string;
  topicId: string;
  windowStart: Date;
  windowEnd: Date;
  uniqueVideoCount: number;
  uniqueChannelCount: number;
  totalObservedViews: bigint | null;
  medianVph: number;
  p90Vph: number;
  outlierVideoCount: number;
  momentumScore: number;
  sampleConfidence: number;
  scoreBreakdown: unknown;
  lifecycleState: string;
}

export function upsertTrendSnapshot(db: PrismaClient, input: UpsertTrendSnapshotInput): Promise<TrendSnapshot> {
  const data = {
    uniqueVideoCount: input.uniqueVideoCount,
    uniqueChannelCount: input.uniqueChannelCount,
    totalObservedViews: input.totalObservedViews,
    medianVph: input.medianVph,
    p90Vph: input.p90Vph,
    outlierVideoCount: input.outlierVideoCount,
    momentumScore: input.momentumScore,
    sampleConfidence: input.sampleConfidence,
    scoreBreakdown: input.scoreBreakdown as object,
    lifecycleState: input.lifecycleState,
  };
  return db.trendSnapshot.upsert({
    where: {
      marketId_topicId_windowStart_windowEnd: {
        marketId: input.marketId,
        topicId: input.topicId,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
      },
    },
    create: {
      marketId: input.marketId,
      topicId: input.topicId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      ...data,
    },
    update: data,
  });
}

/** Most recent snapshot for a (market, topic) pair, feeding `nextTopicLifecycleState`'s "off the prior snapshot" transition input. */
export function getLatestTrendSnapshot(
  db: PrismaClient,
  marketId: string,
  topicId: string,
): Promise<TrendSnapshot | null> {
  return db.trendSnapshot.findFirst({
    where: { marketId, topicId },
    orderBy: { windowEnd: "desc" },
  });
}

/** `GET /topics/:id/trends` backing query: every stored snapshot for a topic, across all markets, newest window first. */
export function listTrendSnapshotsForTopic(db: PrismaClient, topicId: string, limit: number): Promise<TrendSnapshot[]> {
  return db.trendSnapshot.findMany({
    where: { topicId },
    orderBy: { windowEnd: "desc" },
    take: limit,
  });
}
