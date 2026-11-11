import { describe, expect, it, vi } from "vitest";

const { listEnabledDiscoveryQueriesWithMarket } = vi.hoisted(() => ({
  listEnabledDiscoveryQueriesWithMarket: vi.fn(),
}));
vi.mock("@yvi/db", () => ({ listEnabledDiscoveryQueriesWithMarket }));

import { QUEUE_NAMES } from "@yvi/shared";
import type { Queues } from "../queues/index";
import {
  packageMarker,
  RECOMMENDED_SCRAPE_SCHEDULER_ID,
  registerDiscoverySchedulers,
  registerRecommendedScrapeScheduler,
  registerTopicNormalizationScheduler,
  registerTopicTrendAggregationScheduler,
  registerVideoClassificationScheduler,
  registerVideoMonitoringScheduler,
  registerVideoScoringScheduler,
  TOPIC_NORMALIZATION_SCHEDULER_ID,
  TOPIC_TREND_AGGREGATION_SCHEDULER_ID,
  VIDEO_CLASSIFICATION_SCHEDULER_ID,
  VIDEO_MONITORING_SCHEDULER_ID,
  VIDEO_SCORING_SCHEDULER_ID,
} from "./index";

describe("schedulers scaffold", () => {
  it("identifies the module", () => {
    expect(packageMarker()).toBe("@yvi/worker/schedulers");
  });
});

describe("registerDiscoverySchedulers", () => {
  it("routes most_popular queries to discovery-regional and others to discovery-search, keyed by query id", async () => {
    listEnabledDiscoveryQueriesWithMarket.mockResolvedValue([
      { id: "dq-1", strategy: "most_popular", frequencyMinutes: 60 },
      { id: "dq-2", strategy: "recent_search", frequencyMinutes: 15 },
    ]);
    const discoveryRegional = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const discoverySearch = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { discoveryRegional, discoverySearch, videoEnrichment: {}, channelEnrichment: {} };

    const count = await registerDiscoverySchedulers({} as never, queues as never);

    expect(count).toBe(2);
    expect(discoveryRegional.upsertJobScheduler).toHaveBeenCalledWith(
      "dq-1",
      { every: 60 * 60 * 1000 },
      expect.objectContaining({ data: { discoveryQueryId: "dq-1" } }),
    );
    expect(discoverySearch.upsertJobScheduler).toHaveBeenCalledWith(
      "dq-2",
      { every: 15 * 60 * 1000 },
      expect.objectContaining({ data: { discoveryQueryId: "dq-2" } }),
    );
  });
});

describe("registerVideoMonitoringScheduler", () => {
  it("registers exactly one repeatable scheduler under a single static, colon-free id", async () => {
    const videoMonitoring = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { videoMonitoring };

    await registerVideoMonitoringScheduler(queues as never);

    expect(VIDEO_MONITORING_SCHEDULER_ID).not.toContain(":");
    expect(videoMonitoring.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(videoMonitoring.upsertJobScheduler).toHaveBeenCalledWith(
      VIDEO_MONITORING_SCHEDULER_ID,
      { every: 15 * 60 * 1000 },
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("registerVideoScoringScheduler", () => {
  it("registers exactly one repeatable scheduler under a single static, colon-free id, decoupled from the monitoring tick", async () => {
    const videoScoring = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { videoScoring };

    await registerVideoScoringScheduler(queues as never);

    expect(VIDEO_SCORING_SCHEDULER_ID).not.toContain(":");
    expect(VIDEO_SCORING_SCHEDULER_ID).not.toBe(VIDEO_MONITORING_SCHEDULER_ID);
    expect(videoScoring.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(videoScoring.upsertJobScheduler).toHaveBeenCalledWith(
      VIDEO_SCORING_SCHEDULER_ID,
      { every: 15 * 60 * 1000 },
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("registerVideoClassificationScheduler", () => {
  it("registers exactly one repeatable scheduler under a single static, colon-free id", async () => {
    const videoClassification = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { videoClassification };

    await registerVideoClassificationScheduler(queues as never);

    expect(VIDEO_CLASSIFICATION_SCHEDULER_ID).not.toContain(":");
    expect(videoClassification.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(videoClassification.upsertJobScheduler).toHaveBeenCalledWith(
      VIDEO_CLASSIFICATION_SCHEDULER_ID,
      { every: 15 * 60 * 1000 },
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("registerTopicNormalizationScheduler", () => {
  it("registers exactly one repeatable scheduler under a single static, colon-free id, at a lower-than-classification frequency", async () => {
    const topicNormalization = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { topicNormalization };

    await registerTopicNormalizationScheduler(queues as never);

    expect(TOPIC_NORMALIZATION_SCHEDULER_ID).not.toContain(":");
    expect(topicNormalization.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(topicNormalization.upsertJobScheduler).toHaveBeenCalledWith(
      TOPIC_NORMALIZATION_SCHEDULER_ID,
      { every: 4 * 60 * 60 * 1000 },
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("registerTopicTrendAggregationScheduler", () => {
  it("registers exactly one repeatable scheduler under a single static, colon-free id, on a daily cadence", async () => {
    const topicTrendAggregation = { upsertJobScheduler: vi.fn().mockResolvedValue(undefined) };
    const queues = { topicTrendAggregation };

    await registerTopicTrendAggregationScheduler(queues as never);

    expect(TOPIC_TREND_AGGREGATION_SCHEDULER_ID).not.toContain(":");
    expect(topicTrendAggregation.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(topicTrendAggregation.upsertJobScheduler).toHaveBeenCalledWith(
      TOPIC_TREND_AGGREGATION_SCHEDULER_ID,
      { every: 24 * 60 * 60 * 1000 },
      expect.objectContaining({ data: {} }),
    );
  });
});

describe("registerRecommendedScrapeScheduler", () => {
  it("registers a repeatable job scheduler every 6 hours", async () => {
    const upsertJobScheduler = vi.fn();
    const queues = { recommendedScrape: { upsertJobScheduler } } as unknown as Queues;

    await registerRecommendedScrapeScheduler(queues);

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      RECOMMENDED_SCRAPE_SCHEDULER_ID,
      { every: 6 * 60 * 60 * 1000 },
      { name: QUEUE_NAMES.recommendedScrape, data: {} },
    );
  });
});
