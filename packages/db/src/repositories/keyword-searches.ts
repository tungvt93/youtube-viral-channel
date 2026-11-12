import type { KeywordSearch, Market, PrismaClient } from "../../generated/client";

export type KeywordSearchWithMarket = KeywordSearch & { market: Market };

export interface CreateKeywordSearchInput {
  query: string;
  marketId: string;
  language: string;
  jobRunId?: string | null;
}

export function createKeywordSearch(db: PrismaClient, input: CreateKeywordSearchInput): Promise<KeywordSearchWithMarket> {
  return db.keywordSearch.create({ data: input, include: { market: true } });
}

export function getKeywordSearchById(db: PrismaClient, id: string): Promise<KeywordSearchWithMarket | null> {
  return db.keywordSearch.findUnique({ where: { id }, include: { market: true } });
}

export interface ListKeywordSearchesFilter {
  unseenOnly?: boolean;
}

export function listKeywordSearchesWithMarket(
  db: PrismaClient,
  filter: ListKeywordSearchesFilter,
  limit: number,
): Promise<KeywordSearchWithMarket[]> {
  return db.keywordSearch.findMany({
    ...(filter.unseenOnly ? { where: { status: { in: ["completed", "failed"] }, acknowledgedAt: null } } : {}),
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { market: true },
  });
}

export function markKeywordSearchRunning(db: PrismaClient, id: string): Promise<KeywordSearch> {
  return db.keywordSearch.update({ where: { id }, data: { status: "running" } });
}

export interface FinishKeywordSearchInput {
  id: string;
  status: "completed" | "failed";
  videosFound: number;
  recommendedVideosFound: number;
  errorMessage: string | null;
  finishedAt: Date;
}

export function finishKeywordSearch(db: PrismaClient, input: FinishKeywordSearchInput): Promise<KeywordSearch> {
  return db.keywordSearch.update({
    where: { id: input.id },
    data: {
      status: input.status,
      videosFound: input.videosFound,
      recommendedVideosFound: input.recommendedVideosFound,
      errorMessage: input.errorMessage,
      finishedAt: input.finishedAt,
    },
  });
}

/** Idempotent: a row already acknowledged keeps its original `acknowledgedAt` instead of being overwritten by a later call. */
export async function ackKeywordSearch(db: PrismaClient, id: string, now: Date): Promise<KeywordSearch> {
  const existing = await db.keywordSearch.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`KeywordSearch not found: ${id}`);
  }
  if (existing.acknowledgedAt) {
    return existing;
  }
  return db.keywordSearch.update({ where: { id }, data: { acknowledgedAt: now } });
}
