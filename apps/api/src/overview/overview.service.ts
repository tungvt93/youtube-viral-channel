import { Injectable } from "@nestjs/common";
import {
  getOverviewCounts,
  listDiscoveryVolumeByDay,
  listEmergingVideosByMarket,
  listTopEmergingVideos,
  listTopRisingTopics,
  prisma,
  type OverviewCounts,
} from "@yvi/db";
import { ChannelsService, type ChannelListItemDto } from "../channels/channels.service";

/** Default/maximum values for `GET /overview/discovery-volume`'s `days` and `GET /overview/top-signals`'s `limit` — bounds, not tuned product decisions, same reasoning as `MAX_LIMIT` in the topics/channels modules. */
const DEFAULT_DISCOVERY_VOLUME_DAYS = 30;
const MAX_DISCOVERY_VOLUME_DAYS = 90;
const DEFAULT_TOP_SIGNALS_LIMIT = 10;
const MAX_TOP_SIGNALS_LIMIT = 50;

export type OverviewSummaryDto = OverviewCounts;

export interface DiscoveryVolumeByDayDto {
  day: string;
  count: string;
}

export interface EmergingByMarketDto {
  marketId: string;
  marketCode: string;
  emergingVideoCount: number;
}

export interface DiscoveryVolumeDto {
  byDay: DiscoveryVolumeByDayDto[];
  byMarket: EmergingByMarketDto[];
}

export interface TopEmergingVideoDto {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  currentViewCount: string | null;
  latestViralScore: number | null;
  latestScoreComputedAt: string | null;
}

export interface TopRisingTopicDto {
  id: string;
  slug: string;
  canonicalName: string;
  latestMarketId: string | null;
  latestMomentumScore: number | null;
  latestLifecycleState: string | null;
  latestWindowEnd: string | null;
}

export interface TopSignalsDto {
  topEmergingVideos: TopEmergingVideoDto[];
  topRisingTopics: TopRisingTopicDto[];
  topBreakoutChannels: ChannelListItemDto[];
}

function countToString(value: bigint | number | string | null): string | null {
  return value === null ? null : value.toString();
}

function toNumberOrNull(value: number | string | { valueOf(): string } | null): number | null {
  return value === null ? null : Number(value);
}

function toIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function parseDiscoveryVolumeDays(days: string | undefined): number {
  const parsed = days !== undefined ? Number(days) : DEFAULT_DISCOVERY_VOLUME_DAYS;
  return Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DISCOVERY_VOLUME_DAYS, 1), MAX_DISCOVERY_VOLUME_DAYS);
}

export function parseTopSignalsLimit(limit: string | undefined): number {
  const parsed = limit !== undefined ? Number(limit) : DEFAULT_TOP_SIGNALS_LIMIT;
  return Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOP_SIGNALS_LIMIT, 1), MAX_TOP_SIGNALS_LIMIT);
}

/** `GET /overview/*` read-only aggregates backing the Overview dashboard (PRD §13.2) — no write paths, nothing here is scoped to touch `/videos`, `/channels`, or `/topics`. */
@Injectable()
export class OverviewService {
  constructor(private readonly channelsService: ChannelsService) {}

  async summary(): Promise<OverviewSummaryDto> {
    return getOverviewCounts(prisma, new Date());
  }

  async discoveryVolume(days: string | undefined): Promise<DiscoveryVolumeDto> {
    const windowDays = parseDiscoveryVolumeDays(days);
    const [byDay, byMarket] = await Promise.all([listDiscoveryVolumeByDay(prisma, new Date(), windowDays), listEmergingVideosByMarket(prisma)]);
    return {
      byDay: byDay.map((point) => ({
        day: toIsoOrNull(point.day) as string,
        count: countToString(point.count) as string,
      })),
      byMarket,
    };
  }

  async topSignals(limit: string | undefined): Promise<TopSignalsDto> {
    const parsedLimit = parseTopSignalsLimit(limit);
    const [topEmergingVideos, topRisingTopics, topBreakoutChannels] = await Promise.all([
      listTopEmergingVideos(prisma, parsedLimit),
      listTopRisingTopics(prisma, parsedLimit),
      this.channelsService.list("breakout", String(parsedLimit), "0"),
    ]);
    return {
      topEmergingVideos: topEmergingVideos.map((row) => ({
        id: row.id,
        youtubeVideoId: row.youtubeVideoId,
        title: row.title,
        thumbnailUrl: row.thumbnailUrl,
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        currentViewCount: countToString(row.currentViewCount),
        latestViralScore: toNumberOrNull(row.latestViralScore),
        latestScoreComputedAt: toIsoOrNull(row.latestScoreComputedAt),
      })),
      topRisingTopics: topRisingTopics.map((row) => ({
        id: row.id,
        slug: row.slug,
        canonicalName: row.canonicalName,
        latestMarketId: row.latestMarketId,
        latestMomentumScore: toNumberOrNull(row.latestMomentumScore),
        latestLifecycleState: row.latestLifecycleState,
        latestWindowEnd: toIsoOrNull(row.latestWindowEnd),
      })),
      topBreakoutChannels,
    };
  }
}
