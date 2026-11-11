import type { Market, PrismaClient } from "../../generated/client";

export function listEnabledMarkets(db: PrismaClient): Promise<Market[]> {
  return db.market.findMany({ where: { enabled: true } });
}

export function getMarketById(db: PrismaClient, id: string): Promise<Market | null> {
  return db.market.findUnique({ where: { id } });
}

export function getMarketByCode(db: PrismaClient, code: string): Promise<Market | null> {
  return db.market.findUnique({ where: { code } });
}

/** `GET /markets` backing query (PRD §16.2) — unlike `listEnabledMarkets`, admin needs to see disabled markets too, ordered by code for a stable list. */
export function listAllMarkets(db: PrismaClient): Promise<Market[]> {
  return db.market.findMany({ orderBy: { code: "asc" } });
}

/** `PATCH /markets/:id` backing write (PRD §16.2, FR-MKT-02) — only the `enabled` flag, never the raw `config` JSON column (see plan Decisions). */
export function updateMarketEnabled(db: PrismaClient, id: string, enabled: boolean): Promise<Market> {
  return db.market.update({ where: { id }, data: { enabled } });
}
