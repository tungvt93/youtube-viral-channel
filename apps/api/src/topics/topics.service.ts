import { Injectable, NotFoundException } from "@nestjs/common";
import { getTopicById, listTopics, listTrendSnapshotsForTopic, prisma } from "@yvi/db";

/** Default/maximum page size for `GET /topics` and `GET /topics/:id/trends` — same reasoning as `MAX_LIMIT` in the channels module: a bound, not a tuned product decision. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_TRENDS_LIMIT = 30;
const MAX_TRENDS_LIMIT = 100;

export interface TopicListItemDto {
  id: string;
  slug: string;
  canonicalName: string;
  description: string;
  status: string;
  confidence: number | null;
  createdBy: string;
  createdAt: string;
  latestMarketId: string | null;
  latestMomentumScore: number | null;
  latestLifecycleState: string | null;
  latestWindowEnd: string | null;
}

export interface TrendSnapshotDto {
  id: string; // stringified bigint
  marketId: string;
  topicId: string;
  windowStart: string;
  windowEnd: string;
  uniqueVideoCount: number;
  uniqueChannelCount: number;
  totalObservedViews: string | null;
  medianVph: number;
  p90Vph: number;
  outlierVideoCount: number;
  momentumScore: number;
  sampleConfidence: number;
  scoreBreakdown: unknown;
  lifecycleState: string;
}

/** Counts/views come back as `bigint` from Prisma — stringified uniformly, same reasoning as `countToString` in the channels module. */
function countToString(value: bigint | number | string | null): string | null {
  return value === null ? null : value.toString();
}

/** `Decimal` columns (`medianVph`, `p90Vph`, `momentumScore`, `sampleConfidence`, `Topic.confidence`) come back as `Prisma.Decimal` instances from the model API, or plain numbers/strings from raw SQL (`listTopics`) — `Number()` coerces either via `Decimal`'s `valueOf`. */
function toNumberOrNull(value: number | string | { valueOf(): string } | null): number | null {
  return value === null ? null : Number(value);
}

function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function parseListQuery(
  marketId: string | undefined,
  status: string | undefined,
  limit: string | undefined,
  offset: string | undefined,
): { marketId?: string; status?: string; limit: number; offset: number } {
  const parsedLimit = limit !== undefined ? Number(limit) : DEFAULT_LIMIT;
  const parsedOffset = offset !== undefined ? Number(offset) : 0;
  return {
    marketId: marketId || undefined,
    status: status || undefined,
    limit: Math.min(Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

export function parseTrendsLimit(limit: string | undefined): number {
  const parsed = limit !== undefined ? Number(limit) : DEFAULT_TRENDS_LIMIT;
  return Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRENDS_LIMIT, 1), MAX_TRENDS_LIMIT);
}

@Injectable()
export class TopicsService {
  async list(
    marketId: string | undefined,
    status: string | undefined,
    limit: string | undefined,
    offset: string | undefined,
  ): Promise<TopicListItemDto[]> {
    const filter = parseListQuery(marketId, status, limit, offset);
    const rows = await listTopics(prisma, filter);
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      canonicalName: row.canonicalName,
      description: row.description,
      status: row.status,
      confidence: toNumberOrNull(row.confidence),
      createdBy: row.createdBy,
      createdAt: toIsoOrNull(row.createdAt) as string,
      latestMarketId: row.latestMarketId,
      latestMomentumScore: toNumberOrNull(row.latestMomentumScore),
      latestLifecycleState: row.latestLifecycleState,
      latestWindowEnd: toIsoOrNull(row.latestWindowEnd),
    }));
  }

  async trends(topicId: string, limit: string | undefined): Promise<TrendSnapshotDto[]> {
    const topic = await getTopicById(prisma, topicId);
    if (!topic) {
      throw new NotFoundException(`topic ${topicId} not found`);
    }
    const rows = await listTrendSnapshotsForTopic(prisma, topicId, parseTrendsLimit(limit));
    return rows.map((row) => ({
      id: countToString(row.id) as string,
      marketId: row.marketId,
      topicId: row.topicId,
      windowStart: toIsoOrNull(row.windowStart) as string,
      windowEnd: toIsoOrNull(row.windowEnd) as string,
      uniqueVideoCount: row.uniqueVideoCount,
      uniqueChannelCount: row.uniqueChannelCount,
      totalObservedViews: countToString(row.totalObservedViews),
      medianVph: toNumberOrNull(row.medianVph) as number,
      p90Vph: toNumberOrNull(row.p90Vph) as number,
      outlierVideoCount: row.outlierVideoCount,
      momentumScore: toNumberOrNull(row.momentumScore) as number,
      sampleConfidence: toNumberOrNull(row.sampleConfidence) as number,
      scoreBreakdown: row.scoreBreakdown,
      lifecycleState: row.lifecycleState,
    }));
  }
}
