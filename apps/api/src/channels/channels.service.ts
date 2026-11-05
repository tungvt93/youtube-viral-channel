import { Injectable, NotFoundException } from "@nestjs/common";
import { getChannelDetail, listChannels, prisma } from "@yvi/db";

/** Default/maximum page size for `GET /channels` — same reasoning as `MAX_SNAPSHOTS_RETURNED` in the videos module: a bound, not a tuned product decision. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ChannelListItemDto {
  id: string;
  youtubeChannelId: string;
  title: string;
  channelTier: string;
  currentSubscriberCount: string | null;
  currentViewCount: string | null;
  currentVideoCount: string | null;
  latestChannelScore: number | null;
  latestScoreComputedAt: string | null;
}

export interface ChannelDetailDto extends ChannelListItemDto {
  description: string;
  latestScoreBreakdown: unknown;
  latestScoreDataConfidence: number | null;
}

/** Counts come back from `listChannels`/`getChannelDetail`'s raw SQL as `bigint`, `number`, or a numeric string depending on the driver — stringified uniformly so a view count beyond `Number.MAX_SAFE_INTEGER` never loses precision in the JSON response (same reasoning as `VideoSnapshotDto` in the videos module). */
function countToString(value: bigint | number | string | null): string | null {
  return value === null ? null : value.toString();
}

/** `channel_score`/`data_confidence` are `Decimal` columns — stringified-or-numeric depending on the driver, normalized to `number` here since both are well within safe-integer range. */
function toNumberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function parseListQuery(tier: string | undefined, limit: string | undefined, offset: string | undefined): { tier?: string; limit: number; offset: number } {
  const parsedLimit = limit !== undefined ? Number(limit) : DEFAULT_LIMIT;
  const parsedOffset = offset !== undefined ? Number(offset) : 0;
  return {
    tier: tier || undefined,
    limit: Math.min(Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

@Injectable()
export class ChannelsService {
  async list(tier: string | undefined, limit: string | undefined, offset: string | undefined): Promise<ChannelListItemDto[]> {
    const filter = parseListQuery(tier, limit, offset);
    const rows = await listChannels(prisma, filter);
    return rows.map((row) => ({
      id: row.id,
      youtubeChannelId: row.youtubeChannelId,
      title: row.title,
      channelTier: row.channelTier,
      currentSubscriberCount: countToString(row.currentSubscriberCount),
      currentViewCount: countToString(row.currentViewCount),
      currentVideoCount: countToString(row.currentVideoCount),
      latestChannelScore: toNumberOrNull(row.latestChannelScore),
      latestScoreComputedAt: toIsoOrNull(row.latestScoreComputedAt),
    }));
  }

  async detail(channelId: string): Promise<ChannelDetailDto> {
    const row = await getChannelDetail(prisma, channelId);
    if (!row) {
      throw new NotFoundException(`channel ${channelId} not found`);
    }
    return {
      id: row.id,
      youtubeChannelId: row.youtubeChannelId,
      title: row.title,
      description: row.description,
      channelTier: row.channelTier,
      currentSubscriberCount: countToString(row.currentSubscriberCount),
      currentViewCount: countToString(row.currentViewCount),
      currentVideoCount: countToString(row.currentVideoCount),
      latestChannelScore: toNumberOrNull(row.latestChannelScore),
      latestScoreBreakdown: row.latestScoreBreakdown,
      latestScoreDataConfidence: toNumberOrNull(row.latestScoreDataConfidence),
      latestScoreComputedAt: toIsoOrNull(row.latestScoreComputedAt),
    };
  }
}
