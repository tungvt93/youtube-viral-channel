import { describe, expect, it } from "vitest";
import { ClassificationResultSchema, NormalizeTopicsResultSchema, TopicNormalizationProposalSchema } from "./schema";

describe("ClassificationResultSchema", () => {
  const valid = {
    primary_topic: "baking",
    secondary_topics: ["bread", "cooking"],
    format: "tutorial",
    content_language: "en",
    keywords: ["bread", "oven"],
    confidence: 0.92,
    needs_review: false,
  };

  it("accepts a well-formed classification result", () => {
    const result = ClassificationResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults secondary_topics and keywords to [] when omitted", () => {
    const withoutDefaults = {
      primary_topic: valid.primary_topic,
      format: valid.format,
      content_language: valid.content_language,
      confidence: valid.confidence,
      needs_review: valid.needs_review,
    };
    const result = ClassificationResultSchema.safeParse(withoutDefaults);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secondary_topics).toEqual([]);
      expect(result.data.keywords).toEqual([]);
    }
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(ClassificationResultSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    expect(ClassificationResultSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });

  it("rejects more than 5 secondary_topics", () => {
    const result = ClassificationResultSchema.safeParse({
      ...valid,
      secondary_topics: ["a", "b", "c", "d", "e", "f"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 keywords", () => {
    const result = ClassificationResultSchema.safeParse({
      ...valid,
      keywords: Array.from({ length: 11 }, (_, i) => `kw-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const withoutNeedsReview = {
      primary_topic: valid.primary_topic,
      secondary_topics: valid.secondary_topics,
      format: valid.format,
      content_language: valid.content_language,
      keywords: valid.keywords,
      confidence: valid.confidence,
    };
    expect(ClassificationResultSchema.safeParse(withoutNeedsReview).success).toBe(false);
  });

  it("rejects a non-boolean needs_review", () => {
    expect(ClassificationResultSchema.safeParse({ ...valid, needs_review: "false" }).success).toBe(false);
  });
});

describe("TopicNormalizationProposalSchema", () => {
  it("accepts a merge proposal with merge_into_topic_id set", () => {
    const result = TopicNormalizationProposalSchema.safeParse({
      topic_id: "t1",
      action: "merge",
      merge_into_topic_id: "t2",
      canonical_name: null,
      description: null,
      reason: "duplicate of t2",
    });
    expect(result.success).toBe(true);
  });

  it("defaults nullable fields when omitted", () => {
    const result = TopicNormalizationProposalSchema.safeParse({
      topic_id: "t1",
      action: "keep",
      reason: "not enough evidence",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merge_into_topic_id).toBeNull();
      expect(result.data.canonical_name).toBeNull();
      expect(result.data.description).toBeNull();
    }
  });

  it("rejects an invalid action value", () => {
    const result = TopicNormalizationProposalSchema.safeParse({
      topic_id: "t1",
      action: "delete",
      reason: "nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("NormalizeTopicsResultSchema", () => {
  it("defaults proposals to [] when omitted", () => {
    const result = NormalizeTopicsResultSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposals).toEqual([]);
    }
  });

  it("rejects more than 200 proposals", () => {
    const proposals = Array.from({ length: 201 }, (_, i) => ({
      topic_id: `t${i}`,
      action: "keep" as const,
      reason: "r",
    }));
    const result = NormalizeTopicsResultSchema.safeParse({ proposals });
    expect(result.success).toBe(false);
  });
});
