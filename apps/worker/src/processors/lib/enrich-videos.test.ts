import { describe, expect, it, vi } from "vitest";
import type { Queues } from "../../queues/index";

const { createDiscoveryEvent, ensureChannelStub, recordApiUsage, upsertVideo } = vi.hoisted(() => ({
  createDiscoveryEvent: vi.fn(),
  ensureChannelStub: vi.fn(),
  recordApiUsage: vi.fn(),
  upsertVideo: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  createDiscoveryEvent,
  ensureChannelStub,
  recordApiUsage,
  upsertVideo,
}));

const { classifyFormat, QUOTA_COST, YouTubeApiError } = vi.hoisted(() => ({
  classifyFormat: vi.fn().mockReturnValue({ classification: "short_candidate", confidence: 0.9 }),
  QUOTA_COST: { videos_list: 1 },
  YouTubeApiError: class YouTubeApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@yvi/youtube-client", () => ({ classifyFormat, QUOTA_COST, YouTubeApiError }));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("../quota", () => ({ checkQuotaGuard }));

const { enqueueWithJobRun } = vi.hoisted(() => ({ enqueueWithJobRun: vi.fn() }));
vi.mock("../../job-helpers", () => ({ enqueueWithJobRun }));

import { enrichVideoIds, QuotaGuardBlockedError, type EnrichVideoIdsProgress } from "./enrich-videos";

function makeProgress(): EnrichVideoIdsProgress {
  return { savedVideos: [], discoveredChannelIds: new Set() };
}

function makeVideoItem(overrides?: Partial<Record<string, unknown>>) {
  return {
    videoId: "v1",
    channelId: "yt-channel-1",
    title: "A short #shorts",
    description: "",
    publishedAt: "2026-11-01T00:00:00.000Z",
    categoryId: "22",
    durationSeconds: 30,
    viewCount: 1000,
    ...overrides,
  };
}

function makeDeps(overrides?: { listVideosByIds?: ReturnType<typeof vi.fn> }) {
  const listVideosByIds =
    overrides?.listVideosByIds ??
    vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [makeVideoItem()],
    });
  const queues = { channelEnrichment: {} } as unknown as Queues;
  const deps = {
    db: {} as never,
    ai: {} as never,
    aiModel: "unused",
    youtube: { listVideosByIds } as never,
    queues,
    logger: { child: vi.fn().mockReturnValue({ warn: vi.fn(), error: vi.fn() }) } as never,
  };
  return { deps, listVideosByIds };
}

const baseParams = {
  ids: ["v1"],
  rankByVideoId: new Map<string, number | null>([["v1", 0]]),
  marketId: "market-1",
  discoveryQueryId: "dq-1",
  source: "most_popular",
  discoveredAt: new Date("2026-11-05T00:00:00Z"),
  sourcePayload: null,
  jobRunId: "run-1",
};

const now = () => new Date("2026-11-05T00:00:00Z");

describe("enrichVideoIds", () => {
  it("throws QuotaGuardBlockedError and writes nothing when the guard blocks", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 10001 });
    const { deps, listVideosByIds } = makeDeps();
    const progress = makeProgress();

    await expect(enrichVideoIds(deps, baseParams, progress, now)).rejects.toThrow(QuotaGuardBlockedError);
    expect(listVideosByIds).not.toHaveBeenCalled();
    expect(progress.savedVideos).toEqual([]);
  });

  it("upserts a video, writes a DiscoveryEvent with the given source, and records the channel id per result", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValue({ id: "internal-video-1" });
    const { deps } = makeDeps();
    const progress = makeProgress();

    await enrichVideoIds(deps, baseParams, progress, now);

    expect(ensureChannelStub).toHaveBeenCalledWith(deps.db, "yt-channel-1");
    expect(upsertVideo).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ youtubeVideoId: "v1", channelId: "internal-channel-1" }),
    );
    expect(createDiscoveryEvent).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ videoId: "internal-video-1", sourceRank: 0, source: "most_popular" }),
    );
    expect(progress.discoveredChannelIds).toEqual(new Set(["yt-channel-1"]));
  });

  it("pushes each saved video into progress.savedVideos before moving to the next one", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValueOnce({ id: "internal-video-1" }).mockResolvedValueOnce({ id: "internal-video-2" });
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [makeVideoItem({ videoId: "v1" }), makeVideoItem({ videoId: "v2", channelId: "yt-channel-2" })],
    });
    const { deps } = makeDeps({ listVideosByIds });
    const progress = makeProgress();

    await enrichVideoIds(deps, { ...baseParams, ids: ["v1", "v2"] }, progress, now);

    expect(progress.savedVideos).toEqual([
      { id: "internal-video-1", youtubeVideoId: "v1" },
      { id: "internal-video-2", youtubeVideoId: "v2" },
    ]);
  });

  it("enqueues channel-enrichment once for all discovered channel ids, keyed off jobRunId", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValue({ id: "internal-video-1" });
    const { deps } = makeDeps();
    const progress = makeProgress();

    await enrichVideoIds(deps, baseParams, progress, now);

    expect(enqueueWithJobRun).toHaveBeenCalledWith(
      deps.db,
      deps.queues.channelEnrichment,
      "channel-enrichment",
      { youtubeChannelIds: ["yt-channel-1"] },
      "run-1:channels",
    );
  });

  it("records api usage as an error and rethrows when listVideosByIds throws", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const apiError = new Error("boom");
    const listVideosByIds = vi.fn().mockRejectedValue(apiError);
    const { deps } = makeDeps({ listVideosByIds });
    const progress = makeProgress();

    await expect(enrichVideoIds(deps, baseParams, progress, now)).rejects.toThrow(apiError);
    expect(recordApiUsage).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ status: "error" }),
    );
  });

  it("leaves progress.savedVideos with only the videos committed before a mid-loop upsertVideo failure", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    ensureChannelStub.mockResolvedValue({ id: "internal-channel-1" });
    upsertVideo.mockResolvedValueOnce({ id: "internal-video-1" }).mockRejectedValueOnce(new Error("db write failed"));
    const listVideosByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [makeVideoItem({ videoId: "v1" }), makeVideoItem({ videoId: "v2" })],
    });
    const { deps } = makeDeps({ listVideosByIds });
    const progress = makeProgress();

    await expect(enrichVideoIds(deps, { ...baseParams, ids: ["v1", "v2"] }, progress, now)).rejects.toThrow(
      "db write failed",
    );
    expect(progress.savedVideos).toHaveLength(1);
    expect(progress.savedVideos[0]).toEqual({ id: "internal-video-1", youtubeVideoId: "v1" });
  });
});
