import { Injectable, NotFoundException } from "@nestjs/common";
import { getVideoById, listVideoScores, listVideoSnapshots, prisma } from "@yvi/db";

/** Snapshot history "roadmap task" (plan Scope), scoped to a Phase 6 detail-page chart's future needs. */
const MAX_SNAPSHOTS_RETURNED = 500;

/** Score history, same reasoning as `MAX_SNAPSHOTS_RETURNED` — one row per scoring tick a video was eligible for. */
const MAX_SCORES_RETURNED = 500;

export interface VideoSnapshotDto {
  collectedAt: string;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  fetchStatus: string;
  source: string;
}

export interface VideoScoreDto {
  computedAt: string;
  viralScore: number;
  scoreBreakdown: unknown;
  dataConfidence: number;
}

/**
 * Counts are BIGINT and serialized as strings rather than numbers — a view
 * count can exceed `Number.MAX_SAFE_INTEGER`, and `JSON.stringify` throws on
 * a raw `bigint` outright. `viralScore`/`dataConfidence` are Prisma
 * `Decimal`s (6,2 and 5,4 respectively) — well within safe-number range, so
 * `.toNumber()` loses nothing and keeps the DTO JSON-plain.
 */
@Injectable()
export class VideosService {
  async getSnapshots(videoId: string): Promise<VideoSnapshotDto[]> {
    const video = await getVideoById(prisma, videoId);
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const snapshots = await listVideoSnapshots(prisma, videoId, MAX_SNAPSHOTS_RETURNED);
    return snapshots.map((snapshot) => ({
      collectedAt: snapshot.collectedAt.toISOString(),
      viewCount: snapshot.viewCount !== null ? snapshot.viewCount.toString() : null,
      likeCount: snapshot.likeCount !== null ? snapshot.likeCount.toString() : null,
      commentCount: snapshot.commentCount !== null ? snapshot.commentCount.toString() : null,
      fetchStatus: snapshot.fetchStatus,
      source: snapshot.source,
    }));
  }

  async getScores(videoId: string): Promise<VideoScoreDto[]> {
    const video = await getVideoById(prisma, videoId);
    if (!video) {
      throw new NotFoundException(`video ${videoId} not found`);
    }

    const scores = await listVideoScores(prisma, videoId, MAX_SCORES_RETURNED);
    return scores.map((score) => ({
      computedAt: score.computedAt.toISOString(),
      viralScore: score.viralScore.toNumber(),
      scoreBreakdown: score.scoreBreakdown,
      dataConfidence: score.dataConfidence.toNumber(),
    }));
  }
}
