import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { VideoClassificationJobData } from "@yvi/shared";

const {
  finishJobRun,
  getOrCreateCandidateTopic,
  listVideosEligibleForClassification,
  recordAiClassificationRun,
  startJobRun,
  updateVideoClassification,
  upsertVideoTopic,
} = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  getOrCreateCandidateTopic: vi.fn(),
  listVideosEligibleForClassification: vi.fn(),
  recordAiClassificationRun: vi.fn(),
  startJobRun: vi.fn(),
  updateVideoClassification: vi.fn(),
  upsertVideoTopic: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  getOrCreateCandidateTopic,
  listVideosEligibleForClassification,
  recordAiClassificationRun,
  startJobRun,
  updateVideoClassification,
  upsertVideoTopic,
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
vi.mock("@yvi/ai-client", () => ({ GeminiApiError: FakeGeminiApiError }));

const { checkAiBudgetGuard } = vi.hoisted(() => ({ checkAiBudgetGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkAiBudgetGuard }));

import { createVideoClassificationProcessor } from "./video-classification";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(): Job<VideoClassificationJobData> {
  return { id: "tick-1", name: "video-classification", data: {} } as unknown as Job<VideoClassificationJobData>;
}

const NOW = new Date("2026-11-05T12:00:00Z");

function makeVideo(id: string) {
  return {
    id,
    title: `title-${id}`,
    description: `description-${id}`,
    tags: ["tag1"],
    categoryId: "22",
    channelTitle: "Channel",
    channelDescription: "Channel description",
  };
}

function makeDeps(ai: { classifyVideo: ReturnType<typeof vi.fn> }) {
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

describe("createVideoClassificationProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startJobRun.mockResolvedValue({ id: "tick-1" });
    getOrCreateCandidateTopic.mockImplementation(async (_db: unknown, input: { canonicalName: string }) => ({
      id: `topic-${input.canonicalName}`,
    }));
  });

  it("does nothing and completes the JobRun when no video is eligible", async () => {
    listVideosEligibleForClassification.mockResolvedValue([]);
    const classifyVideo = vi.fn();

    const result = await createVideoClassificationProcessor(makeDeps({ classifyVideo }))(makeJob());

    expect(result).toEqual({ classified: 0, failed: 0 });
    expect(classifyVideo).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 0 }));
  });

  it("skips Gemini entirely and fails the JobRun when the AI budget guard blocks the run", async () => {
    listVideosEligibleForClassification.mockResolvedValue([makeVideo("v1")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: false, remaining: 0, projectedUsage: 101 });
    const classifyVideo = vi.fn();

    const result = await createVideoClassificationProcessor(makeDeps({ classifyVideo }))(makeJob());

    expect(result).toEqual({ classified: 0, failed: 0 });
    expect(classifyVideo).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });

  it("classifies a video, links primary and secondary topics, and updates the video row", async () => {
    listVideosEligibleForClassification.mockResolvedValue([makeVideo("v1")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: true, remaining: 99, projectedUsage: 1 });
    const classifyVideo = vi.fn().mockResolvedValue({
      primary_topic: "cooking",
      secondary_topics: ["baking", "desserts"],
      format: "tutorial",
      content_language: "en",
      keywords: ["cake"],
      confidence: 0.9,
      needs_review: false,
    });

    const result = await createVideoClassificationProcessor(makeDeps({ classifyVideo }))(makeJob());

    expect(result).toEqual({ classified: 1, failed: 0 });
    expect(recordAiClassificationRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: "v1", model: "gemini-2.5-flash", status: "success" }),
    );
    expect(upsertVideoTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topicId: "topic-cooking", relationType: "primary" }));
    expect(upsertVideoTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topicId: "topic-baking", relationType: "secondary" }));
    expect(upsertVideoTopic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topicId: "topic-desserts", relationType: "secondary" }));
    expect(updateVideoClassification).toHaveBeenCalledWith(expect.anything(), "v1", "tutorial", 0.9);
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 1 }));
  });

  it("records a failed run and continues to the next video when one video's classification call throws", async () => {
    listVideosEligibleForClassification.mockResolvedValue([makeVideo("v1"), makeVideo("v2")]);
    checkAiBudgetGuard.mockResolvedValue({ allowed: true, remaining: 99, projectedUsage: 2 });
    const classifyVideo = vi
      .fn()
      .mockRejectedValueOnce(new FakeGeminiApiError("schema invalid", "invalid_response"))
      .mockResolvedValueOnce({
        primary_topic: "gaming",
        secondary_topics: [],
        format: "vlog",
        content_language: "en",
        keywords: [],
        confidence: 0.7,
        needs_review: false,
      });

    const result = await createVideoClassificationProcessor(makeDeps({ classifyVideo }))(makeJob());

    expect(result).toEqual({ classified: 1, failed: 1 });
    expect(recordAiClassificationRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: "v1", status: "failed", errorMessage: expect.stringContaining("invalid_response") }),
    );
    expect(updateVideoClassification).toHaveBeenCalledWith(expect.anything(), "v2", "vlog", 0.7);
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "completed", resultCount: 1 }));
  });

  it("fails the JobRun and rethrows when selecting eligible videos errors", async () => {
    listVideosEligibleForClassification.mockRejectedValue(new Error("boom"));
    const classifyVideo = vi.fn();

    await expect(createVideoClassificationProcessor(makeDeps({ classifyVideo }))(makeJob())).rejects.toThrow("boom");

    expect(classifyVideo).not.toHaveBeenCalled();
    expect(finishJobRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "failed" }));
  });
});
