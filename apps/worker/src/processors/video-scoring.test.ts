import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { VideoScoringJobData } from "@yvi/shared";

const {
  finishJobRun,
  insertVideoScore,
  listChannelPeerViews,
  listRecentValidSnapshots,
  listVideosEligibleForScoring,
  startJobRun,
  updateVideoMonitoringState,
} = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  insertVideoScore: vi.fn(),
  listChannelPeerViews: vi.fn(),
  listRecentValidSnapshots: vi.fn(),
  listVideosEligibleForScoring: vi.fn(),
  startJobRun: vi.fn(),
  updateVideoMonitoringState: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  insertVideoScore,
  listChannelPeerViews,
  listRecentValidSnapshots,
  listVideosEligibleForScoring,
  startJobRun,
  updateVideoMonitoringState,
}));

import { createVideoScoringProcessor } from "./video-scoring";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<VideoScoringJobData> {
  return { id: "scoring-tick-1", name: "video-scoring", data: {} } as unknown as Job<VideoScoringJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");
const PUBLISHED_AT = new Date("2026-11-03T12:00:00Z"); // 2 days old -> "1-3d" age bucket

function makeDeps() {
  return { db: {} as never, youtube: {} as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };
}

function baseVideo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    channelId: null,
    publishedAt: PUBLISHED_AT,
    monitoringState: "monitoring",
    lastSnapshotAt: new Date("2026-11-05T11:00:00Z"),
    formatClassification: "shorts",
    currentViewCount: null,
    channelSubscriberCount: null,
    ...overrides,
  };
}

function snapshotsFor(videoId: string, prevViews: number, currViews: number) {
  return [
    { videoId, viewCount: BigInt(currViews), collectedAt: new Date("2026-11-05T11:00:00Z") },
    { videoId, viewCount: BigInt(prevViews), collectedAt: new Date("2026-11-05T10:00:00Z") },
  ];
}

describe("createVideoScoringProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing and completes the JobRun when no video is eligible", async () => {
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });
    listVideosEligibleForScoring.mockResolvedValue([]);

    const result = await createVideoScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 0, skippedInsufficientData: 0, stateChanged: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
    expect(insertVideoScore).not.toHaveBeenCalled();
  });

  it("skips a video with fewer than 2 valid snapshots and writes no VideoScore row for it", async () => {
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });
    listVideosEligibleForScoring.mockResolvedValue([baseVideo("v1")]);
    listRecentValidSnapshots.mockResolvedValue([{ videoId: "v1", viewCount: 1000n, collectedAt: NOW }]);

    const result = await createVideoScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 0, skippedInsufficientData: 1, stateChanged: 0 });
    expect(insertVideoScore).not.toHaveBeenCalled();
    expect(updateVideoMonitoringState).not.toHaveBeenCalled();
  });

  it("scores every eligible video and promotes only the one that clears the cohort's p90 VPH with outlier >= 3", async () => {
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });

    const videos = Array.from({ length: 10 }, (_, i) =>
      baseVideo(`v${i}`, i === 9 ? { currentViewCount: 1_000_000n, channelSubscriberCount: 100n } : {}),
    );
    listVideosEligibleForScoring.mockResolvedValue(videos);

    const allSnapshots = videos.flatMap((_, i) => snapshotsFor(`v${i}`, 0, 100 * (i + 1)));
    listRecentValidSnapshots.mockResolvedValue(allSnapshots);
    listChannelPeerViews.mockResolvedValue([]);

    const result = await createVideoScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 10, skippedInsufficientData: 0, stateChanged: 1 });
    expect(insertVideoScore).toHaveBeenCalledTimes(10);
    expect(insertVideoScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: "v9", computedAt: NOW, viralScore: expect.any(Number), dataConfidence: expect.any(Number) }),
    );

    expect(updateVideoMonitoringState).toHaveBeenCalledTimes(1);
    expect(updateVideoMonitoringState).toHaveBeenCalledWith(expect.anything(), "v9", expect.objectContaining({ monitoringState: "high_signal" }));

    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 10 }));
  });

  it("treats a VPH anomaly (negative delta) as not real growth: no VPH/VPH-percentile contribution, data_confidence reduced", async () => {
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });
    listVideosEligibleForScoring.mockResolvedValue([baseVideo("v1")]);
    listRecentValidSnapshots.mockResolvedValue(snapshotsFor("v1", 5000, 4000));
    listChannelPeerViews.mockResolvedValue([]);

    await createVideoScoringProcessor(makeDeps())(makeJob());

    expect(insertVideoScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        videoId: "v1",
        scoreBreakdown: expect.objectContaining({ vphPercentile: { weight: 0.35, value: null, contribution: null } }),
        dataConfidence: expect.any(Number),
      }),
    );
    const [, insertedInput] = insertVideoScore.mock.calls[0];
    expect(insertedInput.dataConfidence).toBeLessThan(1);
    expect(updateVideoMonitoringState).not.toHaveBeenCalled();
  });

  it("fails the JobRun and rethrows when selecting eligible videos errors", async () => {
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });
    listVideosEligibleForScoring.mockRejectedValue(new Error("boom"));

    await expect(createVideoScoringProcessor(makeDeps())(makeJob())).rejects.toThrow("boom");

    expect(insertVideoScore).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
