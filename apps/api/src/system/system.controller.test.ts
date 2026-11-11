import { describe, expect, it, vi } from "vitest";
import { SystemController } from "./system.controller";
import type { SystemService } from "./system.service";

describe("SystemController", () => {
  it("delegates a health lookup to the service", async () => {
    const health = vi.fn().mockResolvedValue({ status: "ok", quotaPercentUsed: 10, failedCallsToday: 0, recentJobFailures: 0 });
    const controller = new SystemController({ health } as unknown as SystemService);

    const result = await controller.health();

    expect(health).toHaveBeenCalledWith();
    expect(result).toEqual({ status: "ok", quotaPercentUsed: 10, failedCallsToday: 0, recentJobFailures: 0 });
  });

  it("delegates a jobs lookup to the service with the raw limit param", async () => {
    const jobs = vi.fn().mockResolvedValue([]);
    const controller = new SystemController({ jobs } as unknown as SystemService);

    await controller.jobs("25");

    expect(jobs).toHaveBeenCalledWith("25");
  });

  it("delegates a quota lookup to the service", async () => {
    const quota = vi.fn().mockResolvedValue({ budget: 10_000, usedToday: 1_000, percentUsed: 10, band: "ok" });
    const controller = new SystemController({ quota } as unknown as SystemService);

    const result = await controller.quota();

    expect(quota).toHaveBeenCalledWith();
    expect(result).toEqual({ budget: 10_000, usedToday: 1_000, percentUsed: 10, band: "ok" });
  });

  it("delegates an api-usage lookup to the service", async () => {
    const apiUsage = vi.fn().mockResolvedValue({ byEndpoint: [], byMarket: [] });
    const controller = new SystemController({ apiUsage } as unknown as SystemService);

    const result = await controller.apiUsage();

    expect(apiUsage).toHaveBeenCalledWith();
    expect(result).toEqual({ byEndpoint: [], byMarket: [] });
  });
});
