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

  it("delegates a query list lookup to the service", async () => {
    const listQueries = vi.fn().mockResolvedValue([{ id: "q1" }]);
    const controller = new DiscoveryController({ listQueries } as unknown as DiscoveryService);

    const result = await controller.listQueries();

    expect(listQueries).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: "q1" }]);
  });

  it("delegates a query create to the service with the request body", async () => {
    const body = { marketId: "m1", query: "pets", language: "en", strategy: "most_popular", priority: 1, maxPagesPerRun: 1, frequencyMinutes: 60 };
    const createQuery = vi.fn().mockResolvedValue({ id: "q1", ...body });
    const controller = new DiscoveryController({ createQuery } as unknown as DiscoveryService);

    const result = await controller.createQuery(body);

    expect(createQuery).toHaveBeenCalledWith(body);
    expect(result).toEqual({ id: "q1", ...body });
  });

  it("delegates a query update to the service with the id and request body", async () => {
    const body = { priority: 2 };
    const updateQuery = vi.fn().mockResolvedValue({ id: "q1", priority: 2 });
    const controller = new DiscoveryController({ updateQuery } as unknown as DiscoveryService);

    const result = await controller.updateQuery("q1", body);

    expect(updateQuery).toHaveBeenCalledWith("q1", body);
    expect(result).toEqual({ id: "q1", priority: 2 });
  });

  it("delegates a jobs list lookup to the service with the raw limit param", async () => {
    const listJobs = vi.fn().mockResolvedValue([{ id: "job-1" }]);
    const controller = new DiscoveryController({ listJobs } as unknown as DiscoveryService);

    const result = await controller.jobs("10");

    expect(listJobs).toHaveBeenCalledWith("10");
    expect(result).toEqual([{ id: "job-1" }]);
  });

  it("passes undefined for the limit param when none is given", async () => {
    const listJobs = vi.fn().mockResolvedValue([]);
    const controller = new DiscoveryController({ listJobs } as unknown as DiscoveryService);

    await controller.jobs(undefined);

    expect(listJobs).toHaveBeenCalledWith(undefined);
  });
});
