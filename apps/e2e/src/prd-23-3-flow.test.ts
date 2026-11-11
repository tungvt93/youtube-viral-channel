import type { Job, Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTopicPromotion,
  getOrCreateCandidateTopic,
  prisma,
  upsertVideoTopic,
} from "@yvi/db";
import type { ChannelEnrichmentJobData, DiscoveryJobData, VideoEnrichmentJobData } from "@yvi/shared";
import {
  createChannelEnrichmentProcessor,
  createDiscoverySearchProcessor,
  createVideoEnrichmentProcessor,
  type ProcessorDeps,
} from "@yvi/worker";
import { startApi, type RunningApi } from "./api-process";
import { createHttpClient, type HttpClient } from "./http-client";
import { createYoutubeFixture, makeRunMarker } from "./youtube-fixture";

const PORT = 3101;

function makeLogger() {
  const noop = { warn: () => {}, error: () => {} };
  return { child: () => noop } as unknown as ProcessorDeps["logger"];
}

/**
 * Captures what a processor enqueues without a real BullMQ/Redis round
 * trip — `enqueueWithJobRun` (`apps/worker/src/job-helpers.ts`) only reads
 * `queue.name` and calls `queue.add`, so this minimal stand-in satisfies it
 * while this suite drives each processor directly, in-process, chaining its
 * real output into the next (plan Decisions, 2026-11-06: no worker process
 * is spawned, `apps/api`'s own BullMQ queues are left untouched).
 */
function createCapturingQueue(name: string): Queue & { lastCall: { jobName: string; data: unknown; jobId: string } | null } {
  const queue = {
    name,
    lastCall: null as { jobName: string; data: unknown; jobId: string } | null,
    async add(jobName: string, data: unknown, opts: { jobId: string }) {
      queue.lastCall = { jobName, data, jobId: opts.jobId };
      return {};
    },
  };
  return queue as unknown as Queue & { lastCall: typeof queue.lastCall };
}

describe("PRD §23.3 end-to-end flow", () => {
  const runMarker = makeRunMarker();
  let api: RunningApi;
  let anonClient: HttpClient;
  let client: HttpClient;
  let marketId: string;
  let marketWasEnabled: boolean;
  let discoveryQueryId: string;
  let sessionToken: string;
  let videoId: string;
  let internalChannelId: string;
  let topicId: string;

  beforeAll(async () => {
    api = await startApi(PORT);
    anonClient = createHttpClient(api.baseUrl);

    const loginResponse = await anonClient.post("/auth/login", {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    expect(loginResponse.status).toBe(201);
    const loginBody = (await loginResponse.json()) as { sessionToken: string };
    sessionToken = loginBody.sessionToken;
    client = anonClient.withSessionToken(sessionToken);
  });

  afterAll(async () => {
    await prisma.videoTopic.deleteMany({ where: { topicId } }).catch(() => undefined);
    await prisma.discoveryEvent.deleteMany({ where: { videoId } }).catch(() => undefined);
    await prisma.watchlistItem.deleteMany({ where: { entityId: videoId } }).catch(() => undefined);
    await prisma.video.deleteMany({ where: { id: videoId } }).catch(() => undefined);
    await prisma.channel.deleteMany({ where: { id: internalChannelId } }).catch(() => undefined);
    await prisma.topic.deleteMany({ where: { id: topicId } }).catch(() => undefined);
    await prisma.discoveryQuery.deleteMany({ where: { id: discoveryQueryId } }).catch(() => undefined);
    await prisma.jobRun.deleteMany({ where: { id: { startsWith: `e2e-${runMarker}` } } }).catch(() => undefined);
    if (marketId !== undefined && marketWasEnabled !== undefined) {
      await prisma.market.update({ where: { id: marketId }, data: { enabled: marketWasEnabled } }).catch(() => undefined);
    }
    if (sessionToken) {
      await anonClient.post("/auth/logout").catch(() => undefined);
    }
    await api?.close();
  });

  it("enables a market", async () => {
    const listResponse = await client.get("/markets");
    expect(listResponse.status).toBe(200);
    const markets = (await listResponse.json()) as { id: string; enabled: boolean }[];
    expect(markets.length).toBeGreaterThan(0);
    const market = markets[0];
    marketId = market.id;
    marketWasEnabled = market.enabled;

    const updateResponse = await client.patch(`/markets/${marketId}`, { enabled: true });
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as { enabled: boolean };
    expect(updated.enabled).toBe(true);
  });

  it("creates a discovery query", async () => {
    const response = await client.post("/discovery/queries", {
      marketId,
      query: `e2e fixture query ${runMarker}`,
      language: "en",
      strategy: "search",
      priority: 1,
      maxPagesPerRun: 1,
      frequencyMinutes: 60,
      enabled: true,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string };
    discoveryQueryId = body.id;
  });

  it("triggers discovery and discovers a video via the real worker processor chain", async () => {
    const { client: youtube } = createYoutubeFixture(runMarker);
    const videoEnrichmentQueue = createCapturingQueue("video-enrichment");
    const channelEnrichmentQueue = createCapturingQueue("channel-enrichment");

    const deps: ProcessorDeps = {
      db: prisma,
      youtube,
      ai: {} as never,
      aiModel: "unused",
      queues: { videoEnrichment: videoEnrichmentQueue, channelEnrichment: channelEnrichmentQueue } as never,
      logger: makeLogger(),
      now: () => new Date(),
    };

    const searchProcessor = createDiscoverySearchProcessor(deps);
    const searchJob = {
      id: `e2e-${runMarker}-search`,
      name: "discovery-search",
      data: { discoveryQueryId } satisfies DiscoveryJobData,
    } as unknown as Job<DiscoveryJobData>;
    const searchResult = await searchProcessor(searchJob);
    expect(searchResult.discovered).toBe(1);
    expect(videoEnrichmentQueue.lastCall).not.toBeNull();

    const enrichmentProcessor = createVideoEnrichmentProcessor(deps);
    const enrichmentJob = {
      id: videoEnrichmentQueue.lastCall!.jobId,
      name: "video-enrichment",
      data: videoEnrichmentQueue.lastCall!.data as VideoEnrichmentJobData,
    } as unknown as Job<VideoEnrichmentJobData>;
    const enrichmentResult = await enrichmentProcessor(enrichmentJob);
    expect(enrichmentResult.enriched).toBe(1);
    expect(channelEnrichmentQueue.lastCall).not.toBeNull();

    const channelProcessor = createChannelEnrichmentProcessor(deps);
    const channelJob = {
      id: channelEnrichmentQueue.lastCall!.jobId,
      name: "channel-enrichment",
      data: channelEnrichmentQueue.lastCall!.data as ChannelEnrichmentJobData,
    } as unknown as Job<ChannelEnrichmentJobData>;
    const channelResult = await channelProcessor(channelJob);
    expect(channelResult.enriched).toBe(1);

    const savedVideo = await prisma.video.findUnique({ where: { youtubeVideoId: `vid-${runMarker}` } });
    expect(savedVideo).not.toBeNull();
    videoId = savedVideo!.id;
    internalChannelId = savedVideo!.channelId!;
  });

  it("views the discovered video", async () => {
    const response = await client.get(`/videos/${videoId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { title: string; isWatchlisted: boolean };
    expect(body.title).toBe(`E2E fixture video ${runMarker}`);
    expect(body.isWatchlisted).toBe(false);
  });

  /**
   * Snapshot history only exists once the video-monitoring tick has polled
   * the video at least once — out of scope for this suite (it would require
   * waiting for a real scheduled tick against a real YouTube call). The PRD
   * step is satisfied by confirming the chart's data endpoint responds
   * correctly for a video with no snapshots yet (scope note, plan Decisions).
   */
  it("views the (empty) snapshot chart", async () => {
    const response = await client.get(`/videos/${videoId}/snapshots`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("adds the video to the watchlist", async () => {
    const starResponse = await client.post(`/videos/${videoId}/watchlist`);
    expect(starResponse.status).toBe(204);

    const detailResponse = await client.get(`/videos/${videoId}`);
    const body = (await detailResponse.json()) as { isWatchlisted: boolean };
    expect(body.isWatchlisted).toBe(true);
  });

  it("filters viral videos by market and topic", async () => {
    const topic = await getOrCreateCandidateTopic(prisma, {
      canonicalName: `E2E fixture topic ${runMarker}`,
      description: "Fixture topic for the PRD 23.3 e2e flow.",
      confidence: 0.9,
    });
    topicId = topic.id;
    await upsertVideoTopic(prisma, {
      videoId,
      topicId,
      relationType: "primary",
      confidence: 0.9,
      classificationModel: "e2e-fixture",
      promptVersion: "e2e-fixture",
      classifiedAt: new Date(),
    });

    const response = await client.get(`/videos?marketId=${marketId}&topicId=${topicId}`);
    expect(response.status).toBe(200);
    const videos = (await response.json()) as { id: string }[];
    expect(videos.some((v) => v.id === videoId)).toBe(true);
  });

  /**
   * Channel tier/outlier scoring comes from the channel-scoring tick, not
   * run in this suite (same out-of-scope reasoning as the snapshot chart
   * step) — the PRD step is satisfied by confirming the channel detail
   * endpoint the outlier view reads from responds correctly (scope note,
   * plan Decisions).
   */
  it("views the channel detail (outlier) page", async () => {
    const response = await client.get(`/channels/${internalChannelId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { title: string };
    expect(body.title).toBe(`E2E fixture channel ${runMarker}`);
  });

  /**
   * No `apps/api` endpoint exposes "approve topic candidate" — only the
   * `topic-normalization` worker tick calls `applyTopicPromotion` itself
   * (plan Decisions, 2026-11-06: scope note, not a gap this phase adds an
   * endpoint for). This step calls the same real repository function
   * production code uses.
   */
  it("approves the topic candidate", async () => {
    const promoted = await applyTopicPromotion(prisma, topicId, { canonicalName: null, description: null });
    expect(promoted.status).toBe("active");
  });
});
