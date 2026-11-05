import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { ChannelEnrichmentJobData } from "@yvi/shared";

const { finishJobRun, recordApiUsage, upsertChannel } = vi.hoisted(() => ({
  finishJobRun: vi.fn(),
  recordApiUsage: vi.fn(),
  upsertChannel: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  finishJobRun,
  recordApiUsage,
  upsertChannel,
}));

const { checkQuotaGuard } = vi.hoisted(() => ({ checkQuotaGuard: vi.fn() }));
vi.mock("./quota", () => ({ checkQuotaGuard }));

import { createChannelEnrichmentProcessor } from "./channel-enrichment";

function makeLogger() {
  const child = { warn: vi.fn(), error: vi.fn() };
  return { child: vi.fn().mockReturnValue(child), _child: child };
}

function makeJob(youtubeChannelIds: string[]): Job<ChannelEnrichmentJobData> {
  return {
    id: "channel-job-1",
    name: "channel-enrichment",
    data: { jobRunId: "run-channels-1", youtubeChannelIds },
  } as unknown as Job<ChannelEnrichmentJobData>;
}

describe("createChannelEnrichmentProcessor", () => {
  it("upserts each channel from a single batched channels.list call", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    upsertChannel.mockResolvedValue({ id: "internal-channel-1" });
    const listChannelsByIds = vi.fn().mockResolvedValue({
      callsMade: 1,
      items: [{ channelId: "yt-channel-1", title: "Pets Daily", description: "", subscriberCount: 5000 }],
    });
    const logger = makeLogger();
    const deps = {
      db: {} as never,
      youtube: { listChannelsByIds } as never,
      queues: {} as never,
      logger: logger as never,
      now: () => new Date("2026-11-05T00:00:00Z"),
    };

    const processor = createChannelEnrichmentProcessor(deps);
    const result = await processor(makeJob(["yt-channel-1"]));

    expect(result).toEqual({ enriched: 1 });
    expect(listChannelsByIds).toHaveBeenCalledWith(["yt-channel-1"]);
    expect(upsertChannel).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ youtubeChannelId: "yt-channel-1", title: "Pets Daily", currentSubscriberCount: 5000n }),
    );
    expect(finishJobRun).toHaveBeenCalledWith(
      deps.db,
      expect.objectContaining({ id: "run-channels-1", status: "completed", resultCount: 1 }),
    );
  });

  it("marks the JobRun failed and records an error usage row when the API call throws", async () => {
    checkQuotaGuard.mockResolvedValue({ allowed: true, remaining: 9999, projectedUsage: 1 });
    const listChannelsByIds = vi.fn().mockRejectedValue(new Error("network down"));
    const logger = makeLogger();
    const deps = { db: {} as never, youtube: { listChannelsByIds } as never, queues: {} as never, logger: logger as never };

    const processor = createChannelEnrichmentProcessor(deps);

    await expect(processor(makeJob(["yt-channel-1"]))).rejects.toThrow("network down");
    expect(recordApiUsage).toHaveBeenCalledWith(deps.db, expect.objectContaining({ status: "error" }));
    expect(finishJobRun).toHaveBeenCalledWith(deps.db, expect.objectContaining({ id: "run-channels-1", status: "failed" }));
  });
});
