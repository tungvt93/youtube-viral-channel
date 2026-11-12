import type { DiscoveryQuery, Market, PrismaClient } from "../../generated/client";

export type DiscoveryQueryWithMarket = DiscoveryQuery & { market: Market };

export function getDiscoveryQueryById(db: PrismaClient, id: string): Promise<DiscoveryQueryWithMarket | null> {
  return db.discoveryQuery.findUnique({ where: { id }, include: { market: true } });
}

export function listEnabledDiscoveryQueriesWithMarket(db: PrismaClient): Promise<DiscoveryQueryWithMarket[]> {
  return db.discoveryQuery.findMany({
    where: { enabled: true, market: { enabled: true } },
    include: { market: true },
  });
}

/** `GET /markets/:id/health` backing query (`MarketsService.health`) — unlike `listEnabledDiscoveryQueriesWithMarket`, it must count disabled queries too. */
export function listDiscoveryQueriesWithMarket(db: PrismaClient): Promise<DiscoveryQueryWithMarket[]> {
  return db.discoveryQuery.findMany({
    orderBy: { createdAt: "desc" },
    include: { market: true },
  });
}

export function touchDiscoveryQueryLastRunAt(db: PrismaClient, id: string, lastRunAt: Date): Promise<DiscoveryQuery> {
  return db.discoveryQuery.update({ where: { id }, data: { lastRunAt } });
}

export interface CreateDiscoveryQueryInput {
  marketId: string;
  topicId: string | null;
  query: string;
  language: string;
  strategy: string;
  priority: number;
  maxPagesPerRun: number;
  frequencyMinutes: number;
  enabled: boolean;
}

/** Retired per decision 0005 (the `/discovery/queries` routes it backed are gone); kept for schema compatibility with existing `DiscoveryQuery` rows. */
export function createDiscoveryQuery(db: PrismaClient, input: CreateDiscoveryQueryInput): Promise<DiscoveryQueryWithMarket> {
  return db.discoveryQuery.create({ data: input, include: { market: true } });
}

export interface UpdateDiscoveryQueryInput {
  query?: string;
  priority?: number;
  maxPagesPerRun?: number;
  frequencyMinutes?: number;
  enabled?: boolean;
}

/** Retired alongside `createDiscoveryQuery` — only these typed fields, never the raw `config` JSON column (see plan Decisions). */
export function updateDiscoveryQuery(
  db: PrismaClient,
  id: string,
  input: UpdateDiscoveryQueryInput,
): Promise<DiscoveryQueryWithMarket> {
  return db.discoveryQuery.update({ where: { id }, data: input, include: { market: true } });
}
