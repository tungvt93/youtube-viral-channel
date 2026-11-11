import { describe, expect, it, vi } from "vitest";
import { MarketsController } from "./markets.controller";
import type { MarketsService } from "./markets.service";

describe("MarketsController", () => {
  it("delegates a list lookup to the service", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true }]);
    const controller = new MarketsController({ list } as unknown as MarketsService);

    const result = await controller.list();

    expect(list).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: true }]);
  });

  it("delegates an update to the service with the id and body", async () => {
    const update = vi.fn().mockResolvedValue({ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: false });
    const controller = new MarketsController({ update } as unknown as MarketsService);

    const result = await controller.update("m1", { enabled: false });

    expect(update).toHaveBeenCalledWith("m1", { enabled: false });
    expect(result).toEqual({ id: "m1", code: "US", name: "United States", defaultLanguage: "en", timezone: "America/New_York", enabled: false });
  });

  it("delegates a health lookup to the service", async () => {
    const health = vi.fn().mockResolvedValue({ market: { id: "m1" }, discoveryQueryCount: 2, enabledDiscoveryQueryCount: 1, lastDiscoveryRunAt: null, quotaUsedToday: 0 });
    const controller = new MarketsController({ health } as unknown as MarketsService);

    const result = await controller.health("m1");

    expect(health).toHaveBeenCalledWith("m1");
    expect(result).toEqual({ market: { id: "m1" }, discoveryQueryCount: 2, enabledDiscoveryQueryCount: 1, lastDiscoveryRunAt: null, quotaUsedToday: 0 });
  });
});
