import { describe, expect, it, vi } from "vitest";
import { ChannelsController } from "./channels.controller";
import type { ChannelsService } from "./channels.service";

describe("ChannelsController", () => {
  it("delegates a list lookup to the service with the raw query params and the current user id", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreComputedAt: "2026-11-05T12:00:00.000Z", isWatchlisted: true }]);
    const controller = new ChannelsController({ list } as unknown as ChannelsService);

    const result = await controller.list("rising", "true", "10", "0", { id: "user-1" } as never);

    expect(list).toHaveBeenCalledWith("rising", "10", "0", "true", "user-1");
    expect(result).toEqual([{ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreComputedAt: "2026-11-05T12:00:00.000Z", isWatchlisted: true }]);
  });

  it("delegates a detail lookup to the service with the current user id", async () => {
    const detail = vi.fn().mockResolvedValue({ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", description: "desc", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreBreakdown: {}, latestScoreDataConfidence: 0.9, latestScoreComputedAt: "2026-11-05T12:00:00.000Z", isWatchlisted: false });
    const controller = new ChannelsController({ detail } as unknown as ChannelsService);

    const result = await controller.detail("ch1", { id: "user-1" } as never);

    expect(detail).toHaveBeenCalledWith("ch1", "user-1");
    expect(result).toEqual({ id: "ch1", youtubeChannelId: "yt1", title: "Channel 1", description: "desc", channelTier: "rising", currentSubscriberCount: "1000", currentViewCount: "50000", currentVideoCount: "10", latestChannelScore: 60, latestScoreBreakdown: {}, latestScoreDataConfidence: 0.9, latestScoreComputedAt: "2026-11-05T12:00:00.000Z", isWatchlisted: false });
  });

  it("delegates star to the service with the current user id", async () => {
    const star = vi.fn().mockResolvedValue(undefined);
    const controller = new ChannelsController({ star } as unknown as ChannelsService);

    await controller.star("ch1", { id: "user-1" } as never);

    expect(star).toHaveBeenCalledWith("ch1", "user-1");
  });

  it("delegates unstar to the service with the current user id", async () => {
    const unstar = vi.fn().mockResolvedValue(undefined);
    const controller = new ChannelsController({ unstar } as unknown as ChannelsService);

    await controller.unstar("ch1", { id: "user-1" } as never);

    expect(unstar).toHaveBeenCalledWith("ch1", "user-1");
  });
});
