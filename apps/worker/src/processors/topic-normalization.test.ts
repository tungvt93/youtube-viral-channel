import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { TopicNormalizationJobData } from "@yvi/shared";

const { applyTopicMerge, applyTopicPromotion, finishJobRun, listCandidateTopicsForNormalization, recordAiClassificationRun, startJobRun } =
  vi.hoisted(() => ({
    applyTopicMerge: vi.fn(),
    applyTopicPromotion: vi.fn(),
    finishJobRun: vi.fn(),
    listCandidateTopicsForNormalization: vi.fn(),
    recordAiClassificationRun: vi.fn(),
    startJobRun: vi.fn(),
  }));

vi.mock("@yvi/db", () => ({
  applyTopicMerge,
  applyTopicPromotion,
  finishJobRun,
  listCandidateTopicsForNormalization,
  recordAiClassificationRun,
  startJobRun,
}));

const { FakeGeminiApiError } = vi.hoisted(() => ({
  FakeGeminiApiError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("@yvi/ai-client", () => ({ GeminiApiError: FakeGeminiApiError, MAX_CANDIDATES_PER_NORMALIZATION_RUN: 40 }));

const { checkAiBudgetGuard } = vi.hoisted(() => ({ checkAiBudgetGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkAiBudgetGuard }));

import { createTopicNormalizationProcessor } from "./topic-normalization";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<TopicNormalizationJobData> {
  return { id: "tick-1", name: "topic-normalization", data: {} } as unknown as Job<TopicNormalizationJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");

function makeCandidate(id: string) {
  return { id, slug: `slug-${id}`, canonicalName: `name-${id}`, description: "", videoCount: 2, sampleVideoTitles: ["a", "b"] };
}

function makeDeps(ai: { normalizeTopics: ReturnType<typeof vi.fn> }) {
  return {
    db: {} as never,
    youtube: {} as never,
    ai: ai as never,
    aiModel: "gemini-2.5-flash",
    queues: {} as never,
    logger: makeLogger() as never,
    now: () => NOW,
  };
}

describe("createTopicNormalizationProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "tick-1" });
  });

  it("does nothing and completes the JobRun when no candidate topic exists", async () => {
    listCandidateTopicsForNormalization.mockResolvedValue([]);
    const normalizeTopics = vi.fn();

    const result = await createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob());

    expect(result).toEqual({ merged: 0, promoted: 0, kept: 0 });
    expect(normalizeTopics).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
  });

  it("skips Gemini and fails the JobRun when the AI budget guard blocks the run", async () => {
    listCandidateTopicsForNormalization.mockResolvedValue([makeCandidate("t1")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 101 });
    const normalizeTopics = vi.fn();

    const result = await createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob());

    expect(result).toEqual({ merged: 0, promoted: 0, kept: 0 });
    expect(normalizeTopics).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });

  it("applies a merge proposal and a promote proposal, ignoring a keep proposal", async () => {
    listCandidateTopicsForNormalization.mockResolvedValue([makeCandidate("t1"), makeCandidate("t2"), makeCandidate("t3")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: true, remaining: 99, projectedUsage: 1 });
    const normalizeTopics = vi.fn().mockResolvedValue({
      proposals: [
        { topic_id: "t1", action: "merge", merge_into_topic_id: "t2", canonical_name: null, description: null, reason: "dup" },
        { topic_id: "t2", action: "promote", canonical_name: "Real Name", description: "Real description", merge_into_topic_id: null, reason: "clear" },
        { topic_id: "t3", action: "keep", merge_into_topic_id: null, canonical_name: null, description: null, reason: "not enough signal" },
      ],
    });

    const result = await createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob());

    expect(result).toEqual({ merged: 1, promoted: 1, kept: 1 });
    expect(applyTopicMerge).toHaveBeenCalledWith(expect.anything(), "t1", "t2");
    expect(applyTopicPromotion).toHaveBeenCalledWith(expect.anything(), "t2", { canonicalName: "Real Name", description: "Real description" });
    expect(recordAiClassificationRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ videoId: null, status: "success" }));
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 3 }));
  });

  it("ignores a merge proposal that targets a topic outside the current batch", async () => {
    listCandidateTopicsForNormalization.mockResolvedValue([makeCandidate("t1")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: true, remaining: 99, projectedUsage: 1 });
    const normalizeTopics = vi.fn().mockResolvedValue({
      proposals: [{ topic_id: "t1", action: "merge", merge_into_topic_id: "outside-batch", canonical_name: null, description: null, reason: "x" }],
    });

    const result = await createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob());

    expect(result).toEqual({ merged: 0, promoted: 0, kept: 0 });
    expect(applyTopicMerge).not.toHaveBeenCalled();
  });

  it("records a failed run and fails the JobRun when the normalizeTopics call throws", async () => {
    listCandidateTopicsForNormalization.mockResolvedValue([makeCandidate("t1")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: true, remaining: 99, projectedUsage: 1 });
    const normalizeTopics = vi.fn().mockRejectedValue(new FakeGeminiApiError("circuit open", "circuit_open"));

    await expect(createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob())).rejects.toThrow("circuit open");

    expect(recordAiClassificationRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: null, status: "failed", errorMessage: expect.stringContaining("circuit_open") }),
    );
    expect(applyTopicMerge).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });

  it("fails the JobRun and rethrows when selecting candidate topics errors", async () => {
    listCandidateTopicsForNormalization.mockRejectedValue(new Error("boom"));
    const normalizeTopics = vi.fn();

    await expect(createTopicNormalizationProcessor(makeDeps({ normalizeTopics }))(makeJob())).rejects.toThrow("boom");

    expect(normalizeTopics).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
