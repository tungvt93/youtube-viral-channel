import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { recordAiClassificationRun, sumTodayAiUsage } from "./ai-classification-runs";

describe("recordAiClassificationRun", () => {
  it("creates a run row with createdAt and completedAt set to the given completion time", async () => {
    const create = vi.fn().mockResolvedValue({ id: "run-1" });
    const db = { aiClassificationRun: { create } } as unknown as PrismaClient;
    const completedAt = new Date("2026-11-05T12:00:00Z");

    await recordAiClassificationRun(db, {
      videoId: "video-1",
      model: "gemini-2.5-flash",
      promptVersion: "v1",
      inputHash: "hash1",
      output: { format: "tutorial" },
      status: "success",
      errorMessage: null,
      completedAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        videoId: "video-1",
        model: "gemini-2.5-flash",
        promptVersion: "v1",
        inputHash: "hash1",
        output: { format: "tutorial" },
        status: "success",
        errorMessage: null,
        createdAt: completedAt,
        completedAt,
      },
    });
  });

  it("stores a null output as undefined so Prisma omits the JSON field rather than writing a JSON null", async () => {
    const create = vi.fn().mockResolvedValue({ id: "run-1" });
    const db = { aiClassificationRun: { create } } as unknown as PrismaClient;
    const completedAt = new Date("2026-11-05T12:00:00Z");

    await recordAiClassificationRun(db, {
      videoId: null,
      model: "gemini-2.5-flash",
      promptVersion: "v1",
      inputHash: "hash2",
      output: null,
      status: "failed",
      errorMessage: "schema_invalid",
      completedAt,
    });

    const call = create.mock.calls[0][0];
    expect(call.data.videoId).toBeNull();
    expect(call.data.output).toBeUndefined();
    expect(call.data.status).toBe("failed");
    expect(call.data.errorMessage).toBe("schema_invalid");
  });
});

describe("sumTodayAiUsage", () => {
  it("counts ai_classification_runs within the UTC day window", async () => {
    const count = vi.fn().mockResolvedValue(7);
    const db = { aiClassificationRun: { count } } as unknown as PrismaClient;

    const result = await sumTodayAiUsage(db, new Date("2026-11-05T15:30:00Z"));

    expect(result).toBe(7);
    expect(count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date("2026-11-05T00:00:00Z"),
          lt: new Date("2026-11-06T00:00:00Z"),
        },
      },
    });
  });

  it("returns 0 when no runs exist today", async () => {
    const count = vi.fn().mockResolvedValue(0);
    const db = { aiClassificationRun: { count } } as unknown as PrismaClient;

    await expect(sumTodayAiUsage(db, new Date("2026-11-05T00:00:00Z"))).resolves.toBe(0);
  });
});
