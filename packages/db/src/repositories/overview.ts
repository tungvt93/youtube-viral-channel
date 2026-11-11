import type { PrismaClient } from "../../generated/client";

/**
 * Topic lifecycle states counted as "rising" for the Overview dashboard
 * (PRD §13.2): the four states above the `candidate` floor and below/at the
 * `declining` floor (`@yvi/scoring`'s `TopicLifecycleState` enum) — a topic
 * actively gaining momentum, not just observed (`candidate`) or losing it
 * (`declining`). Named here, not re-derived from `@yvi/scoring`, since this
 * package has no dependency on it and the four state names are schema
 * authority (`TrendSnapshot.lifecycleState`'s doc comment), not a scoring
 * implementation detail.
 */
const RISING_TOPIC_LIFECYCLE_STATES = ["emerging", "accelerating", "trending", "peaking"];

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface OverviewCounts {
  newVideosToday: number;
  emergingVideosCount: number;
  breakoutChannelsCount: number;
  risingTopicsCount: number;
  activeMarketsCount: number;
}

async function countRisingTopics(db: PrismaClient): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `
    SELECT count(*)::bigint AS count FROM (
      SELECT DISTINCT ON (topic_id) topic_id, lifecycle_state
      FROM trend_snapshots
      ORDER BY topic_id, window_end DESC
    ) latest
    WHERE latest.lifecycle_state = ANY($1::text[])
    `,
    RISING_TOPIC_LIFECYCLE_STATES,
  );
  return Number(rows[0]?.count ?? 0);
}

/** `GET /overview/summary` backing counts (PRD §13.2 cards) — each a real count over current state, not derived/estimated. */
export async function getOverviewCounts(db: PrismaClient, now: Date): Promise<OverviewCounts> {
  const dayStart = startOfUtcDay(now);
  const [newVideosToday, emergingVideosCount, breakoutChannelsCount, risingTopicsCount, activeMarketsCount] = await Promise.all([
    db.video.count({ where: { firstDiscoveredAt: { gte: dayStart } } }),
    db.video.count({ where: { monitoringState: "high_signal" } }),
    db.channel.count({ where: { channelTier: "breakout" } }),
    countRisingTopics(db),
    db.market.count({ where: { enabled: true } }),
  ]);
  return { newVideosToday, emergingVideosCount, breakoutChannelsCount, risingTopicsCount, activeMarketsCount };
}

export interface DiscoveryVolumePoint {
  day: Date;
  count: bigint;
}

/** `GET /overview/discovery-volume` "discoveries over time" chart (PRD §13.2) — daily discovery-event counts for the trailing `days` window. */
export async function listDiscoveryVolumeByDay(db: PrismaClient, now: Date, days: number): Promise<DiscoveryVolumePoint[]> {
  const dayStart = startOfUtcDay(now);
  const windowStart = new Date(dayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return db.$queryRawUnsafe<DiscoveryVolumePoint[]>(
    `
    SELECT date_trunc('day', discovered_at) AS day, count(*)::bigint AS count
    FROM discovery_events
    WHERE discovered_at >= $1::timestamptz
    GROUP BY 1
    ORDER BY 1
    `,
    windowStart,
  );
}

export interface EmergingByMarketRow {
  marketId: string;
  marketCode: string;
  emergingVideoCount: number;
}

/**
 * `GET /overview/discovery-volume` "emerging videos by market" chart (PRD
 * §13.2). Every enabled market is included via the `LEFT JOIN`s (a market
 * with zero `high_signal` videos still appears, with a real `0`, rather than
 * being silently dropped from the chart) — same "no fake zero for missing
 * data" principle the plan's Risks section calls out, applied the other way:
 * this *is* real, counted data, so it must show as `0`, not be omitted.
 * A video's market is `discovery_events.market_id`, the same documented
 * per-event (not per-video) attribution limitation as
 * `listObservedTopicVideos` in `trend-snapshots.ts`.
 */
export async function listEmergingVideosByMarket(db: PrismaClient): Promise<EmergingByMarketRow[]> {
  return db.$queryRawUnsafe<EmergingByMarketRow[]>(
    `
    SELECT
      m.id AS "marketId",
      m.code AS "marketCode",
      count(DISTINCT v.id) FILTER (WHERE v.monitoring_state = 'high_signal')::int AS "emergingVideoCount"
    FROM markets m
    LEFT JOIN discovery_events de ON de.market_id = m.id
    LEFT JOIN videos v ON v.id = de.video_id
    WHERE m.enabled = true
    GROUP BY m.id, m.code
    ORDER BY "emergingVideoCount" DESC, m.code ASC
    `,
  );
}

export interface TopEmergingVideoRow {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  currentViewCount: bigint | null;
  latestViralScore: number | string | null;
  latestScoreComputedAt: Date | null;
}

/** `GET /overview/top-signals` "top 10 emerging videos" list (PRD §13.2): `high_signal` videos ranked by their latest Viral Score. */
export async function listTopEmergingVideos(db: PrismaClient, limit: number): Promise<TopEmergingVideoRow[]> {
  return db.$queryRawUnsafe<TopEmergingVideoRow[]>(
    `
    SELECT
      v.id AS "id",
      v.youtube_video_id AS "youtubeVideoId",
      v.title AS "title",
      v.thumbnail_url AS "thumbnailUrl",
      v.channel_id AS "channelId",
      c.title AS "channelTitle",
      v.current_view_count AS "currentViewCount",
      latest.viral_score AS "latestViralScore",
      latest.computed_at AS "latestScoreComputedAt"
    FROM videos v
    LEFT JOIN channels c ON c.id = v.channel_id
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (video_id) viral_score, computed_at
      FROM video_scores
      WHERE video_id = v.id
      ORDER BY video_id, computed_at DESC
    ) latest ON true
    WHERE v.monitoring_state = 'high_signal'
    ORDER BY latest.viral_score DESC NULLS LAST, v.current_view_count DESC NULLS LAST
    LIMIT $1
    `,
    limit,
  );
}

export interface TopRisingTopicRow {
  id: string;
  slug: string;
  canonicalName: string;
  latestMarketId: string | null;
  latestMomentumScore: number | string | null;
  latestLifecycleState: string | null;
  latestWindowEnd: Date | null;
}

/** `GET /overview/top-signals` "top 10 rising topics" list (PRD §13.2): topics whose latest snapshot is in a rising lifecycle state, ranked by momentum score. */
export async function listTopRisingTopics(db: PrismaClient, limit: number): Promise<TopRisingTopicRow[]> {
  return db.$queryRawUnsafe<TopRisingTopicRow[]>(
    `
    SELECT
      t.id AS "id",
      t.slug AS "slug",
      t.canonical_name AS "canonicalName",
      latest.market_id AS "latestMarketId",
      latest.momentum_score AS "latestMomentumScore",
      latest.lifecycle_state AS "latestLifecycleState",
      latest.window_end AS "latestWindowEnd"
    FROM topics t
    JOIN LATERAL (
      SELECT DISTINCT ON (topic_id) market_id, momentum_score, lifecycle_state, window_end
      FROM trend_snapshots
      WHERE topic_id = t.id
      ORDER BY topic_id, window_end DESC
    ) latest ON true
    WHERE latest.lifecycle_state = ANY($2::text[])
    ORDER BY latest.momentum_score DESC
    LIMIT $1
    `,
    limit,
    RISING_TOPIC_LIFECYCLE_STATES,
  );
}
