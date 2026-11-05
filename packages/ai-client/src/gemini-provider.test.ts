import { describe, expect, it, vi } from "vitest";
import { GeminiApiError } from "./errors";
import { GeminiProvider } from "./gemini-provider";
import type { ClassifyVideoInput, NormalizeTopicsInput } from "./types";

const classifyInput: ClassifyVideoInput = {
  title: "How to bake bread",
  description: "A simple tutorial on baking bread at home.",
  tags: ["baking", "bread"],
  categoryId: "26",
  channelTitle: "Home Baking Co",
  channelDescription: "We make baking videos.",
};

function geminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    }),
  } as Response;
}

function errorResponse(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

function noSleep() {
  return () => Promise.resolve();
}

describe("GeminiProvider.classifyVideo", () => {
  it("returns a validated classification on a well-formed response", async () => {
    const validJson = JSON.stringify({
      primary_topic: "baking",
      secondary_topics: ["bread"],
      format: "tutorial",
      content_language: "en",
      keywords: ["bread", "oven"],
      confidence: 0.9,
      needs_review: false,
    });
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse(validJson));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    const result = await provider.classifyVideo(classifyInput);

    expect(result.primary_topic).toBe("baking");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("generateContent");
    expect(String(url)).toContain("key=test-key");
  });

  it("retries once on a malformed JSON response, then succeeds", async () => {
    const validJson = JSON.stringify({
      primary_topic: "baking",
      secondary_topics: [],
      format: "tutorial",
      content_language: "en",
      keywords: [],
      confidence: 0.5,
      needs_review: false,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("not json at all"))
      .mockResolvedValueOnce(geminiResponse(validJson));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    const result = await provider.classifyVideo(classifyInput);

    expect(result.primary_topic).toBe("baking");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries once on a schema-invalid response, then throws if still invalid", async () => {
    const invalidJson = JSON.stringify({ primary_topic: "baking" });
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse(invalidJson));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    await expect(provider.classifyVideo(classifyInput)).rejects.toThrow(GeminiApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx response up to maxRetries then throws a server_error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep(), maxRetries: 2 });

    await expect(provider.classifyVideo(classifyInput)).rejects.toMatchObject({ code: "server_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws invalid_request immediately on a 400 without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(400, { error: { message: "bad request" } }));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    await expect(provider.classifyVideo(classifyInput)).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("opens the circuit breaker after repeated failures and blocks further calls", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(500));
    const provider = new GeminiProvider({
      apiKey: "test-key",
      fetchImpl,
      sleep: noSleep(),
      maxRetries: 0,
      circuitBreakerFailureThreshold: 1,
      circuitBreakerCooldownMs: 60_000,
    });

    await expect(provider.classifyVideo(classifyInput)).rejects.toMatchObject({ code: "server_error" });
    fetchImpl.mockClear();

    await expect(provider.classifyVideo(classifyInput)).rejects.toMatchObject({ code: "circuit_open" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("GeminiProvider.normalizeTopics", () => {
  const input: NormalizeTopicsInput = {
    candidates: [
      {
        id: "t1",
        slug: "bread-baking",
        canonicalName: "Bread baking",
        description: "Bread videos",
        videoCount: 3,
        sampleVideoTitles: ["How to bake bread"],
      },
    ],
  };

  it("returns an empty proposals list without calling Gemini when there are no candidates", async () => {
    const fetchImpl = vi.fn();
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    const result = await provider.normalizeTopics({ candidates: [] });

    expect(result.proposals).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns validated proposals for a non-empty batch", async () => {
    const validJson = JSON.stringify({
      proposals: [
        {
          topic_id: "t1",
          action: "promote",
          merge_into_topic_id: null,
          canonical_name: null,
          description: null,
          reason: "distinct topic",
        },
      ],
    });
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse(validJson));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    const result = await provider.normalizeTopics(input);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].action).toBe("promote");
  });

  it("caps the number of candidates sent in a single normalization call", async () => {
    const manyCandidates: NormalizeTopicsInput = {
      candidates: Array.from({ length: 60 }, (_, i) => ({
        id: `t${i}`,
        slug: `topic-${i}`,
        canonicalName: `Topic ${i}`,
        description: "d",
        videoCount: 1,
        sampleVideoTitles: [],
      })),
    };
    const fetchImpl = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ proposals: [] })));
    const provider = new GeminiProvider({ apiKey: "test-key", fetchImpl, sleep: noSleep() });

    await provider.normalizeTopics(manyCandidates);

    const [, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse((options as { body: string }).body) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const promptText = body.contents[0].parts[0].text;
    const occurrences = promptText.split("candidate_index=").length - 1;
    expect(occurrences).toBe(40);
  });
});
