import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  applyTopicMerge,
  applyTopicPromotion,
  findTopicBySlug,
  getOrCreateCandidateTopic,
  getTopicById,
  listCandidateTopicsForNormalization,
  listTopics,
  slugifyTopicLabel,
  upsertVideoTopic,
} from "./topics";

describe("slugifyTopicLabel", () => {
  it("lowercases, collapses non-alphanumeric runs to a single hyphen, and trims edges", () => {
    expect(slugifyTopicLabel("  AI Coding Tools!! ")).toBe("ai-coding-tools");
  });

  it("caps the slug to 160 characters", () => {
    const long = "a".repeat(200);
    expect(slugifyTopicLabel(long)).toHaveLength(160);
  });

  it("treats two different labels that normalize the same as the same slug", () => {
    expect(slugifyTopicLabel("AI Coding Tools")).toBe(slugifyTopicLabel("ai coding tools!!!"));
  });
});

describe("findTopicBySlug", () => {
  it("looks up a topic by its slug", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "topic-1" });
    const db = { topic: { findUnique } } as unknown as PrismaClient;

    await findTopicBySlug(db, "ai-coding-tools");

    expect(findUnique).toHaveBeenCalledWith({ where: { slug: "ai-coding-tools" } });
  });
});

describe("getTopicById", () => {
  it("looks up a topic by its internal id", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "topic-1" });
    const db = { topic: { findUnique } } as unknown as PrismaClient;

    await getTopicById(db, "topic-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "topic-1" } });
  });
});

describe("getOrCreateCandidateTopic", () => {
  it("returns the existing topic when one already matches the slug", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "topic-1", slug: "ai-tools" });
    const create = vi.fn();
    const db = { topic: { findUnique, create } } as unknown as PrismaClient;

    const result = await getOrCreateCandidateTopic(db, {
      canonicalName: "AI Tools",
      description: "desc",
      confidence: 0.8,
    });

    expect(result).toEqual({ id: "topic-1", slug: "ai-tools" });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a candidate/ai-created topic when no slug match exists", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "topic-new", slug: "ai-tools" });
    const db = { topic: { findUnique, create } } as unknown as PrismaClient;

    const result = await getOrCreateCandidateTopic(db, {
      canonicalName: "AI Tools",
      description: "desc",
      confidence: 0.8,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        slug: "ai-tools",
        canonicalName: "AI Tools",
        description: "desc",
        status: "candidate",
        confidence: 0.8,
        createdBy: "ai",
      },
    });
    expect(result).toEqual({ id: "topic-new", slug: "ai-tools" });
  });

  it("re-reads by slug and returns that row when create fails on a concurrent-insert race", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "topic-raced", slug: "ai-tools" });
    const create = vi.fn().mockRejectedValue(new Error("unique constraint violation"));
    const db = { topic: { findUnique, create } } as unknown as PrismaClient;

    const result = await getOrCreateCandidateTopic(db, {
      canonicalName: "AI Tools",
      description: "desc",
      confidence: 0.8,
    });

    expect(result).toEqual({ id: "topic-raced", slug: "ai-tools" });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("rethrows when create fails and the re-read still finds nothing", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const error = new Error("some other failure");
    const create = vi.fn().mockRejectedValue(error);
    const db = { topic: { findUnique, create } } as unknown as PrismaClient;

    await expect(
      getOrCreateCandidateTopic(db, { canonicalName: "AI Tools", description: "desc", confidence: 0.8 }),
    ).rejects.toThrow(error);
  });
});

describe("upsertVideoTopic", () => {
  it("upserts on the composite (videoId, topicId) key", async () => {
    const upsert = vi.fn().mockResolvedValue({ videoId: "video-1", topicId: "topic-1" });
    const db = { videoTopic: { upsert } } as unknown as PrismaClient;
    const classifiedAt = new Date("2026-11-05T12:00:00Z");

    await upsertVideoTopic(db, {
      videoId: "video-1",
      topicId: "topic-1",
      relationType: "primary",
      confidence: 0.9,
      classificationModel: "gemini-2.5-flash",
      promptVersion: "v1",
      classifiedAt,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { videoId_topicId: { videoId: "video-1", topicId: "topic-1" } },
      create: {
        videoId: "video-1",
        topicId: "topic-1",
        relationType: "primary",
        confidence: 0.9,
        classificationModel: "gemini-2.5-flash",
        promptVersion: "v1",
        classifiedAt,
      },
      update: {
        relationType: "primary",
        confidence: 0.9,
        classificationModel: "gemini-2.5-flash",
        promptVersion: "v1",
        classifiedAt,
      },
    });
  });
});

describe("listCandidateTopicsForNormalization", () => {
  it("selects candidate topics with their video count and up to 5 sample titles, oldest-created-first", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "topic-1",
        slug: "ai-tools",
        canonicalName: "AI Tools",
        description: "desc",
        _count: { videoTopics: 12 },
        videoTopics: [{ video: { title: "Title A" } }, { video: { title: "Title B" } }],
      },
    ]);
    const db = { topic: { findMany } } as unknown as PrismaClient;

    const result = await listCandidateTopicsForNormalization(db, 50);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: "candidate" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        slug: true,
        canonicalName: true,
        description: true,
        _count: { select: { videoTopics: true } },
        videoTopics: {
          take: 5,
          orderBy: { classifiedAt: "desc" },
          select: { video: { select: { title: true } } },
        },
      },
    });
    expect(result).toEqual([
      {
        id: "topic-1",
        slug: "ai-tools",
        canonicalName: "AI Tools",
        description: "desc",
        videoCount: 12,
        sampleVideoTitles: ["Title A", "Title B"],
      },
    ]);
  });
});

describe("applyTopicMerge", () => {
  it("sets status=merged and mergedIntoTopicId", async () => {
    const update = vi.fn().mockResolvedValue({ id: "topic-1" });
    const db = { topic: { update } } as unknown as PrismaClient;

    await applyTopicMerge(db, "topic-1", "topic-2");

    expect(update).toHaveBeenCalledWith({
      where: { id: "topic-1" },
      data: { status: "merged", mergedIntoTopicId: "topic-2" },
    });
  });
});

describe("applyTopicPromotion", () => {
  it("sets status=active and applies the given name/description updates", async () => {
    const update = vi.fn().mockResolvedValue({ id: "topic-1" });
    const db = { topic: { update } } as unknown as PrismaClient;

    await applyTopicPromotion(db, "topic-1", { canonicalName: "AI Coding Tools", description: "Cleaned up" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "topic-1" },
      data: { status: "active", canonicalName: "AI Coding Tools", description: "Cleaned up" },
    });
  });

  it("leaves name/description untouched when updates are null", async () => {
    const update = vi.fn().mockResolvedValue({ id: "topic-1" });
    const db = { topic: { update } } as unknown as PrismaClient;

    await applyTopicPromotion(db, "topic-1", { canonicalName: null, description: null });

    expect(update).toHaveBeenCalledWith({
      where: { id: "topic-1" },
      data: { status: "active", canonicalName: undefined, description: undefined },
    });
  });
});

describe("listTopics", () => {
  it("runs the latest-trend-snapshot query with limit/offset and no filters", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listTopics(db, { limit: 20, offset: 0 });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).not.toContain("AND market_id");
    expect(sql).not.toContain("WHERE t.status");
    expect(params).toEqual([20, 0]);
  });

  it("adds both the market filter (inside the lateral join) and the status filter with bound parameters", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const db = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaClient;

    await listTopics(db, { limit: 20, offset: 0, marketId: "market-us", status: "active" });

    const [sql, ...params] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("AND market_id = $3");
    expect(sql).toContain("WHERE t.status = $4");
    expect(params).toEqual([20, 0, "market-us", "active"]);
  });
});
