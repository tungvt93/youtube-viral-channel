import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { VideoMonitoringJobData } from "@yvi/shared";

const {
  finishJobRun,
  insertVideoSnapshot,
  listVideosDueForSnapshot,
  recordApiUsage,
  startJobRun,
  updateVideoMonitoringState,
} = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  insertVideoSnapshot: vi.fn(),
  listVideosDueForSnapshot: vi.fn(),
  recordApiUsage: vi.fn(),
  startJobRun: vi.fn(),
  updateVideoMonitoringState: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  insertVideoSnapshot,
  listVideosDueForSnapshot,
  recordApiUsage,
  startJobRun,
  updateVideoMonitoringState,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

import { createVideoMonitoringProcessor } from "./video-monitoring";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<VideoMonitoringJobData> {
  return { id: "tick-1", name: "video-monitoring", data: {} } as unknown as Job<VideoMonitoringJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");

describe("createVideoMonitoringProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing and completes the JobRun when no video is due", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([]);
    const deps = { db: {} as never, youtube: {} as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createVideoMonitoringProcessor(deps)(makeJob());

    expect(result).toEqual({ snapshotted: 0, unavailable: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "tick-1", status: "completed", resultCount: 0 }));
  });

  it("skips the API call and fails the JobRun when the quota guard blocks the run", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([
      { id: "v1", youtubeVideoId: "yt1", publishedAt: new Date("2026-11-01T00:00:00Z"), monitoringState: "candidate", lastSnapshotAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    const listVideosByIds = vi.fn();
    const deps = { db: {} as never, youtube: { listVideosByIds } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createVideoMonitoringProcessor(deps)(makeJob());

    expect(result).toEqual({ snapshotted: 0, unavailable: 0 });
    expect(listVideosByIds).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "tick-1", status: "failed" }));
  });

  it("inserts a snapshot and transitions candidate to monitoring on a successful return", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([
      { id: "v1", youtubeVideoId: "yt1", publishedAt: new Date("2026-11-01T00:00:00Z"), monitoringState: "candidate", lastSnapshotAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [{ videoId: "yt1", viewCount: 5000, likeCount: 100, commentCount: 10 }],
    });
    const deps = { db: {} as never, youtube: { listVideosByIds } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createVideoMonitoringProcessor(deps)(makeJob());

    expect(result).toEqual({ snapshotted: 1, unavailable: 0 });
    expect(insertVideoSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: "v1", collectedAt: NOW, viewCount: 5000n, likeCount: 100n, commentCount: 10n, fetchStatus: "ok", source: "videos.list" }),
    );
    expect(updateVideoMonitoringState).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      expect.objectContaining({ monitoringState: "monitoring", lastSnapshotAt: NOW }),
    );
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 1 }));
  });

  it("never substitutes 0 and writes a lower count as-is without clamping", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([
      { id: "v1", youtubeVideoId: "yt1", publishedAt: new Date("2026-11-01T00:00:00Z"), monitoringState: "monitoring", lastSnapshotAt: new Date("2026-11-05T06:00:00Z") },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [{ videoId: "yt1", viewCount: 400 }],
    });
    const deps = { db: {} as never, youtube: { listVideosByIds } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    await createVideoMonitoringProcessor(deps)(makeJob());

    expect(insertVideoSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ viewCount: 400n, likeCount: null, commentCount: null }),
    );
  });

  it("writes no snapshot and transitions to unavailable when the API no longer returns the video", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([
      { id: "v1", youtubeVideoId: "yt1", publishedAt: new Date("2026-11-01T00:00:00Z"), monitoringState: "monitoring", lastSnapshotAt: new Date("2026-11-05T06:00:00Z") },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listVideosByIds = vi.fn().mockResolvedValue({ callsMade: 1, items: [] });
    const deps = { db: {} as never, youtube: { listVideosByIds } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createVideoMonitoringProcessor(deps)(makeJob());

    expect(result).toEqual({ snapshotted: 0, unavailable: 1 });
    expect(insertVideoSnapshot).not.toHaveBeenCalled();
    expect(updateVideoMonitoringState).toHaveBeenCalledWith(expect.anything(), "v1", expect.objectContaining({ monitoringState: "unavailable" }));
  });

  it("writes no snapshot and fails the JobRun when the whole videos.list call errors", async () => {
    startJobRun.mockResolvedValue({ id: "tick-1" });
    listVideosDueForSnapshot.mockResolvedValue([
      { id: "v1", youtubeVideoId: "yt1", publishedAt: new Date("2026-11-01T00:00:00Z"), monitoringState: "monitoring", lastSnapshotAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listVideosByIds = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = { db: {} as never, youtube: { listVideosByIds } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    await expect(createVideoMonitoringProcessor(deps)(makeJob())).rejects.toThrow("boom");

    expect(insertVideoSnapshot).not.toHaveBeenCalled();
    expect(updateVideoMonitoringState).not.toHaveBeenCalled();
    expect(recordApiUsage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "error" }));
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
