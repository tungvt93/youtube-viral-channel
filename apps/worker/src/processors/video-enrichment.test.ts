import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { VideoEnrichmentJobData } from "@yvi/shared";
import type { Queues } from "../queues/index";

const { createDiscoveryEvent, ensureChannelStub, finishJobRun, recordApiUsage, upsertVideo } = vi.hoisted(() => ({
  createDiscoveryEvent: vi.fn(),
  ensureChannelStub: vi.fn(),
  finishJobRun: vi.fn(),
  recordApiUsage: vi.fn(),
  upsertVideo: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  createDiscoveryEvent,
  ensureChannelStub,
  finishJobRun,
  recordApiUsage,
  upsertVideo,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../job-helpers", () => ({ enqueueWithJobRun }));

import { createVideoEnrichmentProcessor } from "./video-enrichment";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(items: VideoEnrichmentJobData["items"], overrides?: Partial<VideoEnrichmentJobData>): Job<VideoEnrichmentJobData> {
  return {
    id: "enrich-job-1",
    name: "video-enrichment",
    data: {
      jobRunId: "run-1",
      marketId: "market-1",
      discoveryQueryId: "dq-1",
      source: "most_popular",
      discoveredAt: "2026-11-05T00:00:00.000Z",
      items,
      ...overrides,
    },
  } as unknown as Job<VideoEnrichmentJobData>;
}

describe("createVideoEnrichmentProcessor", () => {
  it("upserts each video+channel, writes a DiscoveryEvent, and fans out channel-enrichment", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValue({ id: "internal-video-1" });
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [
        {
          videoId: "v1",
          channelId: "yt-channel-1",
          title: "A short #shorts",
          description: "",
          publishedAt: "2026-11-01T00:00:00.000Z",
          categoryId: "22",
          durationSeconds: 30,
          viewCount: 1000,
        },
      ],
    });
    const logger = makeLogger();
    const queues = { channelEnrichment: {} } as unknown as Queues;
    const deps = {
      db: {} as never, ai: {} as never, aiModel: "unused",
      youtube: { listVideosByIds } as never,
      queues,
      logger: logger as never,
      now: () => new Date("2026-11-05T00:00:00Z"),
    };

    const processor = createVideoEnrichmentProcessor(deps);
    const result = await processor(makeJob([{ videoId: "v1", sourceRank: 0 }]));

    expect(result).toEqual({ enriched: 1 });
    expect(listVideosByIds).toHaveBeenCalledWith(["v1"], { includePlayer: true, maxHeight: 200 });
    expect(ensureChannelStub).toHaveBeenCalledWith(deps.db, "yt-channel-1");
    expect(upsertVideo).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ youtubeVideoId: "v1", channelId: "internal-channel-1", currentViewCount: 1000n, formatClassification: "short_candidate" }),
    );
    expect(createDiscoveryEvent).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ videoId: "internal-video-1", sourceRank: 0, source: "most_popular" }),
    );
    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      queues.channelEnrichment,
      "channel-enrichment",
      { youtubeChannelIds: ["yt-channel-1"] },
      "run-1:channels",
    );
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "run-1", status: "completed", resultCount: 1 }));
  });

  it("fails the JobRun and skips the API call when the quota guard blocks the run", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    const listVideosByIds = vi.fn();
    const logger = makeLogger();
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: { listVideosByIds } as never, queues: {} as never, logger: logger as never };

    const processor = createVideoEnrichmentProcessor(deps);
    const result = await processor(makeJob([{ videoId: "v1", sourceRank: 0 }]));

    expect(result).toEqual({ enriched: 0 });
    expect(listVideosByIds).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "run-1", status: "failed" }));
  });

  it("passes job.data.sourcePayload through to createDiscoveryEvent, defaulting to null when absent", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValue({ id: "internal-video-1" });
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [
        {
          videoId: "v1",
          channelId: "yt-channel-1",
          title: "A short #shorts",
          description: "",
          publishedAt: "2026-11-01T00:00:00.000Z",
          categoryId: "22",
          durationSeconds: 30,
          viewCount: 1000,
        },
      ],
    });
    const logger = makeLogger();
    const queues = { channelEnrichment: {} } as unknown as Queues;
    const deps = {
      db: {} as never, ai: {} as never, aiModel: "unused",
      youtube: { listVideosByIds } as never,
      queues,
      logger: logger as never,
      now: () => new Date("2026-11-05T00:00:00Z"),
    };

    const processor = createVideoEnrichmentProcessor(deps);
    await processor(makeJob([{ videoId: "v1", sourceRank: 0 }], { sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" } }));

    expect(createDiscoveryEvent).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ sourcePayload: { seedVideoId: "v1", rootSeedVideoId: "v1", gl: "US", hl: "en" } }),
    );
  });
});
