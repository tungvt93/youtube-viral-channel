import { describe, expect, it, vi } from "vitest";
import { ChannelsController } from "./channels.controller";
import type { ChannelsService } from "./channels.service";

describe("ChannelsController", () => {
  it("delegates a list lookup to the service with the raw query params", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreComputedAt: "2026-11-05T12:00:00.000Z" }]);
    const controller = new ChannelsController({ list } as unknown as ChannelsService);

    const result = await controller.list("rising", "10", "0");

    expect(list).toHaveBeenCalledWith("rising", "10", "0");
    expect(result).toEqual([{ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreComputedAt: "2026-11-05T12:00:00.000Z" }]);
  });

  it("delegates a detail lookup to the service", async () => {
    const detail = vi.fn().mockResolvedValue({ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", description: "desc", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreBreakdown: {}, latestScoreDataConfidence: 0.9, latestScoreComputedAt: "2026-11-05T12:00:00.000Z" });
    const controller = new ChannelsController({ detail } as unknown as ChannelsService);

    const result = await controller.detail("ch1");

    expect(detail).toHaveBeenCalledWith("ch1");
    expect(result).toEqual({ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", description: "desc", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreBreakdown: {}, latestScoreDataConfidence: 0.9, latestScoreComputedAt: "2026-11-05T12:00:00.000Z" });
  });
});
