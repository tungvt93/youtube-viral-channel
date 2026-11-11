import { describe, expect, it, vi } from "vitest";
import { OverviewController } from "./overview.controller";
import type { OverviewService } from "./overview.service";

describe("OverviewController", () => {
  it("delegates a summary lookup to the service", async () => {
    const summary = vi.fn().mockResolvedValue({ newVideosToday: 3 });
    const controller = new OverviewController({ summary } as unknown as OverviewService);

    const result = await controller.summary();

    expect(summary).toHaveBeenCalledWith();
    expect(result).toEqual({ newVideosToday: 3 });
  });

  it("delegates a discovery-volume lookup to the service with the raw days param", async () => {
    const discoveryVolume = vi.fn().mockResolvedValue({ byDay: [], byMarket: [] });
    const controller = new OverviewController({ discoveryVolume } as unknown as OverviewService);

    const result = await controller.discoveryVolume("7");

    expect(discoveryVolume).toHaveBeenCalledWith("7");
    expect(result).toEqual({ byDay: [], byMarket: [] });
  });

  it("delegates a top-signals lookup to the service with the raw limit param", async () => {
    const topSignals = vi.fn().mockResolvedValue({ topEmergingVideos: [], topRisingTopics: [], topBreakoutChannels: [] });
    const controller = new OverviewController({ topSignals } as unknown as OverviewService);

    const result = await controller.topSignals("10");

    expect(topSignals).toHaveBeenCalledWith("10");
    expect(result).toEqual({ topEmergingVideos: [], topRisingTopics: [], topBreakoutChannels: [] });
  });
});
