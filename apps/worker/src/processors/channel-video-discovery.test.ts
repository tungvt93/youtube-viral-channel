import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { ChannelVideoDiscoveryJobData } from "@yvi/shared";
import type { Queues } from "../queues/index";

const {
  finishJobRun,
  listChannelsDueForVideoDiscovery,
  listKnownYoutubeVideoIds,
  recordApiUsage,
  startJobRun,
  updateChannelLastVideoDiscoveryAt,
} = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  listChannelsDueForVideoDiscovery: vi.fn(),
  listKnownYoutubeVideoIds: vi.fn(),
  recordApiUsage: vi.fn(),
  startJobRun: vi.fn(),
  updateChannelLastVideoDiscoveryAt: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  listChannelsDueForVideoDiscovery,
  listKnownYoutubeVideoIds,
  recordApiUsage,
  startJobRun,
  updateChannelLastVideoDiscoveryAt,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../job-helpers", () => ({ enqueueWithJobRun }));

import { createChannelVideoDiscoveryProcessor } from "./channel-video-discovery";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<ChannelVideoDiscoveryJobData> {
  return { id: "tick-1", name: "channel-video-discovery", data: {} } as unknown as Job<ChannelVideoDiscoveryJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");

describe("createChannelVideoDiscoveryProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "tick-1" });
  });

  it("does nothing and completes the JobRun when no channel is due", async () => {
    listChannelsDueForVideoDiscovery.mockResolvedValue([]);
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: {} as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createChannelVideoDiscoveryProcessor(deps)(makeJob());

    expect(result).toEqual({ channelsPolled: 0, videosEnqueued: 0, channelsFailed: 0 });
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "tick-1", status: "completed", resultCount: 0 }));
  });

  it("skips the API call and fails the JobRun when the quota guard blocks the run", async () => {
    listChannelsDueForVideoDiscovery.mockResolvedValue([
      { id: "ch1", youtubeChannelId: "ytch1", uploadsPlaylistId: "UU1", lastVideoDiscoveryAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    const listPlaylistItems = vi.fn();
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: { listPlaylistItems } as never, queues: {} as never, logger: makeLogger() as never, now: () => NOW };

    const result = await createChannelVideoDiscoveryProcessor(deps)(makeJob());

    expect(result).toEqual({ channelsPolled: 0, videosEnqueued: 0, channelsFailed: 0 });
    expect(listPlaylistItems).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "tick-1", status: "failed" }));
  });

  it("enqueues only genuinely-new video ids onto video-enrichment and updates lastVideoDiscoveryAt", async () => {
    listChannelsDueForVideoDiscovery.mockResolvedValue([
      { id: "ch1", youtubeChannelId: "ytch1", uploadsPlaylistId: "UU1", lastVideoDiscoveryAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listPlaylistItems = vi.fn().mockResolvedValue({
      items: [
        { videoId: "vid-old", publishedAt: "2026-11-01T00:00:00Z", position: 0 },
        { videoId: "vid-new", publishedAt: "2026-11-04T00:00:00Z", position: 1 },
      ],
      nextPageToken: undefined,
    });
    listKnownYoutubeVideoIds.mockResolvedValue(new Set(["vid-old"]));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: { listPlaylistItems } as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createChannelVideoDiscoveryProcessor(deps)(makeJob());

    expect(result).toEqual({ channelsPolled: 1, videosEnqueued: 1, channelsFailed: 0 });
    expect(listPlaylistItems).toHaveBeenCalledWith("UU1", 20);
    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      queues.videoEnrichment,
      "video-enrichment",
      expect.objectContaining({
        marketId: null,
        discoveryQueryId: null,
        source: "channel_uploads",
        items: [{ videoId: "vid-new", sourceRank: 1 }],
      }),
      "tick-1:ch1",
    );
    expect(updateChannelLastVideoDiscoveryAt).toHaveBeenCalledWith(deps.db, "ch1", NOW);
    expect(recordApiUsage).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "success", marketId: null }));
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "completed", resultCount: 1 }));
  });

  it("does not enqueue when every returned video is already known", async () => {
    listChannelsDueForVideoDiscovery.mockResolvedValue([
      { id: "ch1", youtubeChannelId: "ytch1", uploadsPlaylistId: "UU1", lastVideoDiscoveryAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listPlaylistItems = vi.fn().mockResolvedValue({
      items: [{ videoId: "vid-old", publishedAt: "2026-11-01T00:00:00Z", position: 0 }],
      nextPageToken: undefined,
    });
    listKnownYoutubeVideoIds.mockResolvedValue(new Set(["vid-old"]));
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: { listPlaylistItems } as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createChannelVideoDiscoveryProcessor(deps)(makeJob());

    expect(result).toEqual({ channelsPolled: 1, videosEnqueued: 0, channelsFailed: 0 });
    expect(enqueueWithJobRun).not.toHaveBeenCalled();
    expect(updateChannelLastVideoDiscoveryAt).toHaveBeenCalledWith(deps.db, "ch1", NOW);
  });

  it("counts a channel as failed and continues when its playlistItems.list call errors, without aborting the tick", async () => {
    listChannelsDueForVideoDiscovery.mockResolvedValue([
      { id: "ch1", youtubeChannelId: "ytch1", uploadsPlaylistId: "UU1", lastVideoDiscoveryAt: null },
      { id: "ch2", youtubeChannelId: "ytch2", uploadsPlaylistId: "UU2", lastVideoDiscoveryAt: null },
    ]);
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listPlaylistItems = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ items: [], nextPageToken: undefined });
    listKnownYoutubeVideoIds.mockResolvedValue(new Set());
    const queues = { videoEnrichment: {} } as unknown as Queues;
    const deps = { db: {} as never, ai: {} as never, aiModel: "unused", youtube: { listPlaylistItems } as never, queues, logger: makeLogger() as never, now: () => NOW };

    const result = await createChannelVideoDiscoveryProcessor(deps)(makeJob());

    expect(result).toEqual({ channelsPolled: 2, videosEnqueued: 0, channelsFailed: 1 });
    expect(updateChannelLastVideoDiscoveryAt).toHaveBeenCalledTimes(1);
    expect(updateChannelLastVideoDiscoveryAt).toHaveBeenCalledWith(deps.db, "ch2", NOW);
    expect(recordApiUsage).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "error" }));
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "completed" }));
  });
});
