import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../generated/client";
import { getVideoByYoutubeId, upsertVideo, type VideoUpsertInput } from "./videos";

/**
 * Exercises upsertVideo/getVideoByYoutubeId against a real Postgres instance
 * (BigInt/Decimal round-tripping can't be verified against a mocked client).
 * Requires `docker compose -f infra/docker/docker-compose.yml up -d postgres`
 * and a DATABASE_URL pointing at it; skipped otherwise so plain `pnpm test`
 * (including CI, which has no Postgres service) stays green.
 */
const runIntegration = Boolean(process.env.DATABASE_URL);

describe.runIf(runIntegration)("videos repository (integration)", () => {
  const db = new PrismaClient();
  const youtubeVideoId = `yvi-test-${Date.now()}`;

  afterAll(async () => {
    await db.video.deleteMany({ where: { youtubeVideoId } });
    await db.$disconnect();
  });

  const baseInput: VideoUpsertInput = {
    youtubeVideoId,
    channelId: null,
    title: "Integration test video",
    description: "Created by packages/db integration test",
    publishedAt: new Date("2026-11-01T00:00:00Z"),
    durationSeconds: 45,
    categoryId: "22",
    defaultLanguage: "en",
    thumbnailUrl: null,
    currentViewCount: 1000n,
    currentLikeCount: 10n,
    currentCommentCount: 2n,
    videoLicense: "youtube",
    privacyStatus: "public",
    embeddable: true,
    liveBroadcastContent: "none",
    formatClassification: "short_candidate",
    formatConfidence: 0.9,
  };

  it("creates a video row and reads it back with correct types", async () => {
    await upsertVideo(db, baseInput);
    const found = await getVideoByYoutubeId(db, youtubeVideoId);

    expect(found).not.toBeNull();
    expect(found?.youtubeVideoId).toBe(youtubeVideoId);
    expect(found?.currentViewCount).toBe(1000n);
    expect(found?.formatConfidence.toString()).toBe("0.9");
  });

  it("updates the existing row on a second upsert with the same youtube id", async () => {
    await upsertVideo(db, { ...baseInput, currentViewCount: 5000n });
    const found = await getVideoByYoutubeId(db, youtubeVideoId);

    const count = await db.video.count({ where: { youtubeVideoId } });
    expect(count).toBe(1);
    expect(found?.currentViewCount).toBe(5000n);
  });
});
