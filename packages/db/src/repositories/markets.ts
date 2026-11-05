import type { Market, PrismaClient } from "../../generated/client";

export function listEnabledMarkets(db: PrismaClient): Promise<Market[]> {
  return db.market.findMany({ where: { enabled: true } });
}

export function getMarketById(db: PrismaClient, id: string): Promise<Market | null> {
  return db.market.findUnique({ where: { id } });
}
