import { describe, expect, it } from "vitest";
import { discoveryIdempotencyKey, formatDateBucket, videoEnrichIdempotencyKey } from "./idempotency";

describe("formatDateBucket", () => {
  it("formats a date as a UTC YYYY-MM-DD bucket", () => {
    expect(formatDateBucket(new Date("2026-11-05T23:59:59Z"))).toBe("2026-11-05");
  });

  it("does not shift across a UTC midnight boundary", () => {
    expect(formatDateBucket(new Date("2026-11-05T00:00:00Z"))).toBe("2026-11-05");
  });
});

describe("discoveryIdempotencyKey", () => {
  it("builds the discovery key in the documented format", () => {
    const key = discoveryIdempotencyKey({
      strategy: "recent_search",
      marketCode: "US",
      query: "funny pets",
      dateBucket: "2026-11-05",
    });
    expect(key).toBe("discovery:recent_search:US:funny pets:2026-11-05");
  });
});

describe("videoEnrichIdempotencyKey", () => {
  it("builds the video-enrich key in the documented format", () => {
    const key = videoEnrichIdempotencyKey({ videoId: "abc123", metadataVersion: "2026-11-05" });
    expect(key).toBe("video-enrich:abc123:2026-11-05");
  });
});
