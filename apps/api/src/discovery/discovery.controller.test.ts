import { describe, expect, it, vi } from "vitest";
import { DiscoveryController } from "./discovery.controller";
import type { DiscoveryService } from "./discovery.service";

describe("DiscoveryController", () => {
  it("delegates a manual run trigger to the service", async () => {
    const triggerRun = vi.fn().mockResolvedValue({ jobId: "discovery:most_popular:US:pets:2026-11-05", status: "queued" });
    const controller = new DiscoveryController({ triggerRun } as unknown as DiscoveryService);

    const result = await controller.run("query-1");

    expect(triggerRun).toHaveBeenCalledWith("query-1");
    expect(result).toEqual({ jobId: "discovery:most_popular:US:pets:2026-11-05", status: "queued" });
  });

  it("delegates a job status lookup to the service", async () => {
    const getJobStatus = vi.fn().mockResolvedValue({ id: "job-1", status: "completed" });
    const controller = new DiscoveryController({ getJobStatus } as unknown as DiscoveryService);

    const result = await controller.job("job-1");

    expect(getJobStatus).toHaveBeenCalledWith("job-1");
    expect(result).toEqual({ id: "job-1", status: "completed" });
  });
});
