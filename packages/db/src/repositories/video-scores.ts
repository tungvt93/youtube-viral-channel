import type { PrismaClient, VideoScore } from "../../generated/client";

export interface InsertVideoScoreInput {
  videoId: string;
  computedAt: Date;
  viralScore: number;
  scoreBreakdown: object;
  dataConfidence: number;
}

/** One row per computed score (PRD §8.3/§15.12) — history, never overwritten in place. */
export function insertVideoScore(db: PrismaClient, input: InsertVideoScoreInput): Promise<VideoScore> {
  return db.videoScore.create({
    data: {
      videoId: input.videoId,
      computedAt: input.computedAt,
      viralScore: input.viralScore,
      scoreBreakdown: input.scoreBreakdown,
      dataConfidence: input.dataConfidence,
    },
  });
}

/** Score history for one video, newest first — backs `GET .../videos/:id/scores`. */
export function listVideoScores(db: PrismaClient, videoId: string, limit: number): Promise<VideoScore[]> {
  return db.videoScore.findMany({
    where: { videoId },
    orderBy: { computedAt: "desc" },
    take: limit,
  });
}
