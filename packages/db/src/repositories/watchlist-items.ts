import type { PrismaClient, WatchlistItem } from "../../generated/client";

export interface WatchlistItemInput {
  userId: string;
  entityType: string;
  entityId: string;
}

/**
 * Idempotent star: upserts on the `(userId, entityType, entityId)` unique
 * key (PRD §16.3/§16.4) so starring an already-starred item is a no-op, not
 * a unique-constraint error.
 */
export function addToWatchlist(db: PrismaClient, input: WatchlistItemInput): Promise<WatchlistItem> {
  return db.watchlistItem.upsert({
    where: { userId_entityType_entityId: input },
    create: input,
    update: {},
  });
}

/** Idempotent unstar: deleting an already-unstarred (or never-starred) item is a no-op, not an error. */
export async function removeFromWatchlist(db: PrismaClient, input: WatchlistItemInput): Promise<void> {
  await db.watchlistItem.deleteMany({ where: input });
}

/** Whether the given entity is on the given user's watchlist — used by the video/channel detail DTOs, which read a single row rather than the list filter's correlated-subquery form. */
export async function isWatchlisted(db: PrismaClient, input: WatchlistItemInput): Promise<boolean> {
  const row = await db.watchlistItem.findUnique({
    where: { userId_entityType_entityId: input },
  });
  return row !== null;
}
