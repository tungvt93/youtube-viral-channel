import type { ChannelScore, PrismaClient } from "../../generated/client";

export interface InsertChannelScoreInput {
  channelId: string;
  computedAt: Date;
  channelScore: number;
  scoreBreakdown: object;
  dataConfidence: number;
}

/** One row per computed score (PRD §9.3) — history, never overwritten in place, same convention as `insertVideoScore`. */
export function insertChannelScore(db: PrismaClient, input: InsertChannelScoreInput): Promise<ChannelScore> {
  return db.channelScore.create({
    data: {
      channelId: input.channelId,
      computedAt: input.computedAt,
      channelScore: input.channelScore,
      scoreBreakdown: input.scoreBreakdown,
      dataConfidence: input.dataConfidence,
    },
  });
}

/** The channel's most recent score before this tick, if any — feeds the tier state machine's `isDeclining` signal. */
export function getLatestChannelScore(db: PrismaClient, channelId: string): Promise<ChannelScore | null> {
  return db.channelScore.findFirst({ where: { channelId }, orderBy: { computedAt: "desc" } });
}
