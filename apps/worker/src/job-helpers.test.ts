import { describe, expect, it, vi } from "vitest";

const { startJobRun } = vi.hoisted(() => ({ startJobRun: vi.fn() }));
vi.mock("@yvi/db", () => ({ startJobRun }));

import { enqueueWithJobRun } from "./job-helpers";

describe("enqueueWithJobRun", () => {
  it("starts a JobRun keyed by the given jobId and adds the job with matching jobRunId/jobId", async () => {
    startJobRun.mockResolvedValue({ id: "run-1" });
    const queue = { name: "video-enrichment", add: vi.fn().mockResolvedValue(undefined) };

    const jobRunId = await enqueueWithJobRun(
      {} as never,
      queue as never,
      "video-enrichment",
      { marketId: "market-1" },
      "run-1",
    );

    expect(jobRunId).toBe("run-1");
    expect(startJobRun).toHaveBeenCalledWith({}, expect.objectContaining({ id: "run-1", queue: "video-enrichment" }));
    expect(queue.add).toHaveBeenCalledWith(
      "video-enrichment",
      { marketId: "market-1", jobRunId: "run-1" },
      { jobId: "run-1" },
    );
  });
});
