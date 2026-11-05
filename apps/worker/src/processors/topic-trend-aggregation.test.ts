import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { TopicTrendAggregationJobData } from "@yvi/shared";

const { finishJobRun, getLatestTrendSnapshot, listEnabledMarkets, listObservedTopicVideos, startJobRun, upsertTrendSnapshot } = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  getLatestTrendSnapshot: vi.fn(),
  listEnabledMarkets: vi.fn(),
  listObservedTopicVideos: vi.fn(),
  startJobRun: vi.fn(),
  upsertTrendSnapshot: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  getLatestTrendSnapshot,
  listEnabledMarkets,
  listObservedTopicVideos,
  startJobRun,
  upsertTrendSnapshot,
}));

import { createTopicTrendAggregationProcessor } from "./topic-trend-aggregation";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<TopicTrendAggregationJobData> {
  return { id: "trend-tick-1", name: "topic-trend-aggregation", data: {} } as unknown as Job<TopicTrendAggregationJobData>;
}

const NOW = new Date("2026-11-06T12:00:00Z");

function makeDeps() {
  return { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };
}

/** 20 videos published at `now`, 1000 views each, one channel per video — maximal recency/breadth, zero outliers. */
function hotRows(marketId: string, topicId: string) {
  return Array.from({ length: 20 }, (_, i) => ({
    marketId,
    topicId,
    videoId: `hot-v${i}`,
    channelId: `hot-ch${i}`,
    currentViewCount: 1000n,
    publishedAt: NOW,
  }));
}

/** 20 videos published 10 days ago, 10 views each, all on one channel — minimal recency/breadth, zero outliers. */
function coldRows(marketId: string, topicId: string) {
  return Array.from({ length: 20 }, (_, i) => ({
    marketId,
    topicId,
    videoId: `cold-v${i}`,
    channelId: "cold-ch0",
    currentViewCount: 10n,
    publishedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
  }));
}

describe("createTopicTrendAggregationProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "trend-tick-1" });
    upsertTrendSnapshot.mockResolvedValue({});
  });

  it("does nothing and completes the JobRun when no video was observed in the window", async () => {
    listObservedTopicVideos.mockResolvedValue([]);
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);

    const result = await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ aggregated: 0, lifecycleChanged: 0 });
    expect(upsertTrendSnapshot).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
  });

  it("excludes rows whose market is not enabled", async () => {
    listObservedTopicVideos.mockResolvedValue([...hotRows("m-enabled", "t1"), ...coldRows("m-disabled", "t1")]);
    listEnabledMarkets.mockResolvedValue([{ id: "m-enabled" }]);
    getLatestTrendSnapshot.mockResolvedValue(null);

    const result = await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(result.aggregated).toBe(1);
    expect(upsertTrendSnapshot).toHaveBeenCalledTimes(1);
    expect(upsertTrendSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ marketId: "m-enabled", topicId: "t1" }));
  });

  it("percentile-ranks view velocity across the tick's own cohort and promotes the hot group past trending while the cold group stays candidate", async () => {
    listObservedTopicVideos.mockResolvedValue([...hotRows("m1", "hot-topic"), ...coldRows("m1", "cold-topic")]);
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);
    getLatestTrendSnapshot.mockResolvedValue(null);

    const result = await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ aggregated: 2, lifecycleChanged: 1 });

    const hotCall = upsertTrendSnapshot.mock.calls.find(([, input]) => input.topicId === "hot-topic");
    expect(hotCall?.[1]).toMatchObject({
      marketId: "m1",
      uniqueVideoCount: 20,
      uniqueChannelCount: 20,
      medianVph: 1000,
      p90Vph: 1000,
      outlierVideoCount: 0,
      lifecycleState: "trending",
    });
    expect(hotCall?.[1].momentumScore).toBeCloseTo(63.333, 2);
    expect(hotCall?.[1].sampleConfidence).toBeCloseTo(1, 9);

    const coldCall = upsertTrendSnapshot.mock.calls.find(([, input]) => input.topicId === "cold-topic");
    expect(coldCall?.[1]).toMatchObject({
      marketId: "m1",
      uniqueVideoCount: 20,
      uniqueChannelCount: 1,
      outlierVideoCount: 0,
      lifecycleState: "candidate",
    });
    expect(coldCall?.[1].momentumScore).toBeLessThan(25);
  });

  it("forces candidate when sample confidence is below the floor, even with a high raw momentum score", async () => {
    listObservedTopicVideos.mockResolvedValue(hotRows("m1", "tiny-topic").slice(0, 2));
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);
    getLatestTrendSnapshot.mockResolvedValue(null);

    await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(upsertTrendSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ uniqueVideoCount: 2, lifecycleState: "candidate" }),
    );
  });

  it("demotes a peaking topic to declining when momentum drops from the prior snapshot", async () => {
    listObservedTopicVideos.mockResolvedValue(hotRows("m1", "t1"));
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);
    getLatestTrendSnapshot.mockResolvedValue({ uniqueVideoCount: 20, momentumScore: 80, lifecycleState: "peaking" });

    const result = await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ aggregated: 1, lifecycleChanged: 1 });
    expect(upsertTrendSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lifecycleState: "declining" }));
  });

  it("recovers a declining topic to accelerating once momentum rises back above the threshold", async () => {
    listObservedTopicVideos.mockResolvedValue(hotRows("m1", "t1"));
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);
    getLatestTrendSnapshot.mockResolvedValue({ uniqueVideoCount: 20, momentumScore: 5, lifecycleState: "declining" });

    const result = await createTopicTrendAggregationProcessor(makeDeps())(makeJob());

    expect(result).toEqual({ aggregated: 1, lifecycleChanged: 1 });
    expect(upsertTrendSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lifecycleState: "accelerating" }));
  });

  it("fails the JobRun and rethrows when selecting observed videos errors", async () => {
    listObservedTopicVideos.mockRejectedValue(new Error("boom"));
    listEnabledMarkets.mockResolvedValue([{ id: "m1" }]);

    await expect(createTopicTrendAggregationProcessor(makeDeps())(makeJob())).rejects.toThrow("boom");

    expect(upsertTrendSnapshot).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
