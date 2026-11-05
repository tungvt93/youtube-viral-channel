import type { Prisma } from "../../generated/client";
import type { DiscoveryEvent, PrismaClient } from "../../generated/client";

export interface CreateDiscoveryEventInput {
  videoId: string;
  /** Null for channel-uploads-sourced discovery (PRD §9.5) — not market-scoped. */
  marketId: string | null;
  discoveryQueryId: string | null;
  source: string;
  sourceRank: number | null;
  discoveredAt: Date;
  sourcePayload: Prisma.InputJsonValue | null;
}

export function createDiscoveryEvent(db: PrismaClient, input: CreateDiscoveryEventInput): Promise<DiscoveryEvent> {
  return db.discoveryEvent.create({
    data: {
      videoId: input.videoId,
      marketId: input.marketId,
      discoveryQueryId: input.discoveryQueryId,
      source: input.source,
      sourceRank: input.sourceRank,
      discoveredAt: input.discoveredAt,
      sourcePayload: input.sourcePayload ?? undefined,
    },
  });
}
