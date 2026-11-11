import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import AlertsPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("AlertsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the alerts list", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await AlertsPage();

    expect(fetchApi).toHaveBeenCalledWith("/alerts");
  });

  it("renders without throwing when there are no alerts", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await AlertsPage();

    expect(result).toBeTruthy();
  });

  it("renders without throwing for video, channel, and topic alerts, read and unread", async () => {
    vi.mocked(fetchApi).mockResolvedValue([
      {
        id: "a1",
        alertType: "video_high_signal",
        entityType: "video",
        entityId: "v1",
        message: '"Some Video" entered high signal state',
        severity: "info",
        isRead: false,
        triggeredAt: "2026-11-06T00:00:00.000Z",
        readAt: null,
      },
      {
        id: "a2",
        alertType: "channel_breakout",
        entityType: "channel",
        entityId: "c1",
        message: '"Some Channel" broke out',
        severity: "info",
        isRead: true,
        triggeredAt: "2026-11-05T00:00:00.000Z",
        readAt: "2026-11-05T01:00:00.000Z",
      },
      {
        id: "a3",
        alertType: "topic_trending",
        entityType: "topic",
        entityId: "m1:t1",
        message: 'Topic "Some Topic" is now trending',
        severity: "info",
        isRead: false,
        triggeredAt: "2026-11-04T00:00:00.000Z",
        readAt: null,
      },
    ] as never);

    const result = await AlertsPage();

    expect(result).toBeTruthy();
  });
});
