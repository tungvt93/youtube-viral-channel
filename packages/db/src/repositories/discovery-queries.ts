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

export function touchDiscoveryQueryLastRunAt(db: PrismaClient, id: string, lastRunAt: Date): Promise<DiscoveryQuery> {
  return db.discoveryQuery.update({ where: { id }, data: { lastRunAt } });
}
