import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { ChannelScoringJobData } from "@yvi/shared";

const {
  finishJobRun,
  getLatestChannelScore,
  insertChannelScore,
  listChannelsEligibleForScoring,
  listChannelVideosForScoring,
  listRecentValidSnapshots,
  startJobRun,
  updateChannelTier,
} = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  getLatestChannelScore: vi.fn(),
  insertChannelScore: vi.fn(),
  listChannelsEligibleForScoring: vi.fn(),
  listChannelVideosForScoring: vi.fn(),
  listRecentValidSnapshots: vi.fn(),
  startJobRun: vi.fn(),
  updateChannelTier: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  getLatestChannelScore,
  insertChannelScore,
  listChannelsEligibleForScoring,
  listChannelVideosForScoring,
  listRecentValidSnapshots,
  startJobRun,
  updateChannelTier,
}));

import { createChannelScoringProcessor } from "./channel-scoring";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<ChannelScoringJobData> {
  return { id: "scoring-tick-1", name: "channel-scoring", data: {} } as unknown as Job<ChannelScoringJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");

function makeDeps() {
  return { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };
}

function baseChannel(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    youtubeChannelId: `yt-${id}`,
    channelTier: "newcomer",
    currentSubscriberCount: 1000n,
    firstDiscoveredAt: new Date("2026-10-26T00:00:00Z"),
    ...overrides,
  };
}

describe("createChannelScoringProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "scoring-tick-1" });
    getLatestChannelScore.mockResolvedValue(null);
  });

  it("does nothing and completes the JobRun when no channel is eligible", async () => {
    listChannelsEligibleForScoring.mockResolvedValue([]);

    const result = await createChannelScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 0, tierChanged: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
    expect(insertChannelScore).not.toHaveBeenCalled();
  });

  it("re-normalizes around missing metrics and promotes newcomer to rising once score clears 50", async () => {
    listChannelsEligibleForScoring.mockResolvedValue([baseChannel("ch1", { firstDiscoveredAt: new Date("2026-10-26T00:00:00Z") })]);
    listChannelVideosForScoring.mockResolvedValue([{ id: "v1", publishedAt: NOW, currentViewCount: 100n }]);
    listRecentValidSnapshots.mockResolvedValue([]);

    const result = await createChannelScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 1, tierChanged: 1 });
    expect(insertChannelScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelId: "ch1", computedAt: NOW, channelScore: expect.closeTo(60, 5), dataConfidence: 0.5 }),
    );
    expect(updateChannelTier).toHaveBeenCalledWith(expect.anything(), "ch1", "rising");
  });

  it("graduates an aged, inactive channel from newcomer to established without the score crossing a tier threshold", async () => {
    listChannelsEligibleForScoring.mockResolvedValue([baseChannel("ch2", { firstDiscoveredAt: new Date("2025-01-01T00:00:00Z") })]);
    listChannelVideosForScoring.mockResolvedValue([{ id: "v1", publishedAt: new Date("2020-01-01T00:00:00Z"), currentViewCount: null }]);
    listRecentValidSnapshots.mockResolvedValue([]);

    const result = await createChannelScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 1, tierChanged: 1 });
    const [, insertedInput] = insertChannelScore.mock.calls[0];
    expect(insertedInput.channelScore).toBeLessThan(50);
    expect(updateChannelTier).toHaveBeenCalledWith(expect.anything(), "ch2", "established");
  });

  it("holds the tier when the newly computed tier matches the current one", async () => {
    listChannelsEligibleForScoring.mockResolvedValue([
      baseChannel("ch3", { channelTier: "established", firstDiscoveredAt: new Date("2025-01-01T00:00:00Z") }),
    ]);
    listChannelVideosForScoring.mockResolvedValue([{ id: "v1", publishedAt: new Date("2020-01-01T00:00:00Z"), currentViewCount: null }]);
    listRecentValidSnapshots.mockResolvedValue([]);

    const result = await createChannelScoringProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ scored: 1, tierChanged: 0 });
    expect(updateChannelTier).not.toHaveBeenCalled();
  });

  it("reports full dataConfidence when all four components have data (outlier ratio, VPH, consistency, recency)", async () => {
    listChannelsEligibleForScoring.mockResolvedValue([baseChannel("ch4")]);
    listChannelVideosForScoring.mockResolvedValue([
      { id: "v1", publishedAt: new Date("2026-10-26T00:00:00Z"), currentViewCount: 100n },
      { id: "v2", publishedAt: new Date("2026-10-29T00:00:00Z"), currentViewCount: 100n },
      { id: "v3", publishedAt: new Date("2026-11-01T00:00:00Z"), currentViewCount: 100n },
      { id: "v4", publishedAt: new Date("2026-11-04T00:00:00Z"), currentViewCount: 500n },
    ]);
    listRecentValidSnapshots.mockResolvedValue([
      { videoId: "v4", viewCount: 500n, collectedAt: new Date("2026-11-05T11:00:00Z") },
      { videoId: "v4", viewCount: 400n, collectedAt: new Date("2026-11-05T10:00:00Z") },
    ]);

    await createChannelScoringProcessor(makeDeps())(makeJob());

    const [, insertedInput] = insertChannelScore.mock.calls[0];
    expect(insertedInput.channelId).toBe("ch4");
    expect(insertedInput.dataConfidence).toBeCloseTo(1, 9);
  });

  it("fails the JobRun and rethrows when selecting eligible channels errors", async () => {
    listChannelsEligibleForScoring.mockRejectedValue(new Error("boom"));

    await expect(createChannelScoringProcessor(makeDeps())(makeJob())).rejects.toThrow("boom");

    expect(insertChannelScore).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
