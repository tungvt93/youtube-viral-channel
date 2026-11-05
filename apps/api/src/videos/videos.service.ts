import { Injectable, NotFoundException } from "@nestjs/common";
import { getVideoById, listVideoSnapshots, prisma } from "@yvi/db";

/** Snapshot history "roadmap task" (plan Scope), scoped to a Phase 6 detail-page chart's future needs. */
const MAX_SNAPSHOTS_RETURNED = 500;

export interface VideoSnapshotDto {
  collectedAt: string;
  viewCount: string | null;
  likeCount: string | null;
  commentCount: string | null;
  fetchStatus: string;
  source: string;
}

/**
 * Counts are BIGINT and serialized as strings rather than numbers — a view
 * count can exceed `Number.MAX_SAFE_INTEGER`, and `JSON.stringify` throws on
 * a raw `bigint` outright.
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
}
