import type { PrismaClient, VideoSnapshot } from "../../generated/client";

export interface InsertVideoSnapshotInput {
  videoId: string;
  collectedAt: Date;
  viewCount: bigint | null;
  likeCount: bigint | null;
  commentCount: bigint | null;
  fetchStatus: string;
  source: string;
}

/**
 * One row per successful snapshot (PRD §7.4/§7.5). Callers must skip this
 * call entirely on an API error or a video the API no longer returns —
 * there is no sentinel/zero-filled row for either case, so a gap in a
 * video's history is just a gap, not fabricated data.
 */
export function insertVideoSnapshot(db: PrismaClient, input: InsertVideoSnapshotInput): Promise<VideoSnapshot> {
  return db.videoSnapshot.create({
    data: {
      videoId: input.videoId,
      collectedAt: input.collectedAt,
      viewCount: input.viewCount,
      likeCount: input.likeCount,
      commentCount: input.commentCount,
      fetchStatus: input.fetchStatus,
      source: input.source,
    },
  });
}

/** Snapshot history for one video, newest first — backs `GET .../videos/:id/snapshots`. */
export function listVideoSnapshots(db: PrismaClient, videoId: string, limit: number): Promise<VideoSnapshot[]> {
  return db.videoSnapshot.findMany({
    where: { videoId },
    orderBy: { collectedAt: "desc" },
    take: limit,
  });
}

/**
 * All `fetchStatus: "ok"` snapshots for a batch of videos, newest first
 * within each video — feeds a scoring tick's VPH/Acceleration computation
 * (PRD §8.1). One query for the whole batch (grouped/sliced by the caller)
 * instead of one query per video, avoiding N+1 for a ~200-video tick.
 */
export function listRecentValidSnapshots(db: PrismaClient, videoIds: string[]): Promise<VideoSnapshot[]> {
  return db.videoSnapshot.findMany({
    where: { videoId: { in: videoIds }, fetchStatus: "ok" },
    orderBy: [{ videoId: "asc" }, { collectedAt: "desc" }],
  });
}
