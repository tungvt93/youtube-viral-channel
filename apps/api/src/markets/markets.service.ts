import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getMarketById, listAllMarkets, listDiscoveryQueriesWithMarket, prisma, sumQuotaUsageByMarket, updateMarketEnabled } from "@yvi/db";

export interface MarketDto {
  id: string;
  code: string;
  name: string;
  defaultLanguage: string;
  timezone: string;
  enabled: boolean;
}

export interface MarketHealthDto {
  market: MarketDto;
  discoveryQueryCount: number;
  enabledDiscoveryQueryCount: number;
  lastDiscoveryRunAt: string | null;
  quotaUsedToday: number;
}

function toMarketDto(market: { id: string; code: string; name: string; defaultLanguage: string; timezone: string; enabled: boolean }): MarketDto {
  return {
    id: market.id,
    code: market.code,
    name: market.name,
    defaultLanguage: market.defaultLanguage,
    timezone: market.timezone,
    enabled: market.enabled,
  };
}

/** `PATCH /markets/:id` request body — only `enabled` (PRD §16.2, FR-MKT-02); never the raw `config` JSON column (see plan Decisions). */
export interface UpdateMarketBody {
  enabled?: boolean;
}

@Injectable()
export class MarketsService {
  async list(): Promise<MarketDto[]> {
    const markets = await listAllMarkets(prisma);
    return markets.map(toMarketDto);
  }

  async update(id: string, body: UpdateMarketBody): Promise<MarketDto> {
    if (typeof body?.enabled !== "boolean") {
      throw new BadRequestException("enabled must be a boolean");
    }
    const existing = await getMarketById(prisma, id);
    if (!existing) {
      throw new NotFoundException(`market ${id} not found`);
    }
    const updated = await updateMarketEnabled(prisma, id, body.enabled);
    return toMarketDto(updated);
  }

  /** `GET /markets/:id/health` (PRD §16.2) — composes already-planned repository functions; no new `packages/db` query added for this (see plan Decisions). */
  async health(id: string): Promise<MarketHealthDto> {
    const market = await getMarketById(prisma, id);
    if (!market) {
      throw new NotFoundException(`market ${id} not found`);
    }

    const [discoveryQueries, quotaByMarket] = await Promise.all([
      listDiscoveryQueriesWithMarket(prisma),
      sumQuotaUsageByMarket(prisma, new Date()),
    ]);

    const marketQueries = discoveryQueries.filter((query) => query.marketId === id);
    const lastRunAt = marketQueries.reduce<Date | null>((latest, query) => {
      if (!query.lastRunAt) return latest;
      return !latest || query.lastRunAt > latest ? query.lastRunAt : latest;
    }, null);
    const quotaUsedToday = quotaByMarket.find((row) => row.marketId === id)?.totalQuota ?? 0;

    return {
      market: toMarketDto(market),
      discoveryQueryCount: marketQueries.length,
      enabledDiscoveryQueryCount: marketQueries.filter((query) => query.enabled).length,
      lastDiscoveryRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      quotaUsedToday,
    };
  }
}
