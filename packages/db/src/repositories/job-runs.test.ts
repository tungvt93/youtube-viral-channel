import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { finishJobRun, getJobRunById, listRecentJobRuns, startJobRun } from "./job-runs";

describe("startJobRun", () => {
  it("creates a new running job when no id is given", async () => {
    const create = vi.fn().mockResolvedValue({ id: "job-1" });
    const db = { jobRun: { create } } as unknown as PrismaClient;
    const startedAt = new Date("2026-11-06T12:00:00Z");

    await startJobRun(db, { jobName: "discovery-run", queue: "discovery", startedAt });

    expect(create).toHaveBeenCalledWith({
      data: { jobName: "discovery-run", queue: "discovery", status: "running", startedAt },
    });
  });

  it("upserts on a pre-assigned id so a repeated idempotency key is a no-op", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-1" });
    const db = { jobRun: { upsert } } as unknown as PrismaClient;
    const startedAt = new Date("2026-11-06T12:00:00Z");

    await startJobRun(db, { id: "job-1", jobName: "discovery-run", queue: "discovery", startedAt });

    expect(upsert).toHaveBeenCalledWith({
      where: { id: "job-1" },
      create: { id: "job-1", jobName: "discovery-run", queue: "discovery", status: "running", startedAt },
      update: {},
    });
  });
});

describe("finishJobRun", () => {
  it("writes the final status/timing/result fields for the given job id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "job-1" });
    const db = { jobRun: { update } } as unknown as PrismaClient;
    const finishedAt = new Date("2026-11-06T12:05:00Z");

    await finishJobRun(db, {
      id: "job-1",
      status: "completed",
      finishedAt,
      durationMs: 5000,
      resultCount: 12,
      errorMessage: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "completed", finishedAt, durationMs: 5000, resultCount: 12, errorMessage: null },
    });
  });
});

describe("getJobRunById", () => {
  it("looks up a job run by its id", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "job-1" });
    const db = { jobRun: { findUnique } } as unknown as PrismaClient;

    await getJobRunById(db, "job-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "job-1" } });
  });
});

describe("listRecentJobRuns", () => {
  it("selects the most-recently-started jobs up to the given limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { jobRun: { findMany } } as unknown as PrismaClient;

    await listRecentJobRuns(db, 50);

    expect(findMany).toHaveBeenCalledWith({ orderBy: { startedAt: "desc" }, take: 50 });
  });
});
