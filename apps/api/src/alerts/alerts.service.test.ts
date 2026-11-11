import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertById, listAlerts, markAlertRead } from "@yvi/db";
import { AlertsService, parseListQuery } from "./alerts.service";

vi.mock("@yvi/db", () => ({
  getAlertById: vi.fn(),
  listAlerts: vi.fn(),
  markAlertRead: vi.fn(),
  prisma: {},
}));

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    alertType: "video_high_signal",
    entityType: "video",
    entityId: "v1",
    message: '"Some Video" entered high signal state',
    severity: "info",
    isRead: false,
    triggeredAt: new Date("2026-11-06T00:00:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

describe("AlertsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("maps Alert rows to the DTO shape with ISO timestamps", async () => {
      vi.mocked(listAlerts).mockResolvedValue([alertRow()] as never);
      const service = new AlertsService();

      const result = await service.list({});

      expect(listAlerts).toHaveBeenCalledWith({}, { isRead: undefined, limit: 20, offset: 0 });
      expect(result).toEqual([
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
      ]);
    });

    it("passes the isRead filter through when given", async () => {
      vi.mocked(listAlerts).mockResolvedValue([]);
      const service = new AlertsService();

      await service.list({ isRead: "true" });

      expect(listAlerts).toHaveBeenCalledWith({}, { isRead: true, limit: 20, offset: 0 });
    });

    it("clamps the limit to the maximum page size", async () => {
      vi.mocked(listAlerts).mockResolvedValue([]);
      const service = new AlertsService();

      await service.list({ limit: "500" });

      expect(listAlerts).toHaveBeenCalledWith({}, { isRead: undefined, limit: 100, offset: 0 });
    });

    it("falls back to the default limit for a non-positive or non-numeric value", async () => {
      vi.mocked(listAlerts).mockResolvedValue([]);
      const service = new AlertsService();

      await service.list({ limit: "0" });
      expect(listAlerts).toHaveBeenCalledWith({}, { isRead: undefined, limit: 20, offset: 0 });

      await service.list({ limit: "not-a-number" });
      expect(listAlerts).toHaveBeenCalledWith({}, { isRead: undefined, limit: 20, offset: 0 });
    });
  });

  describe("markRead", () => {
    it("throws NotFoundException when the alert does not exist", async () => {
      vi.mocked(getAlertById).mockResolvedValue(null);
      const service = new AlertsService();

      await expect(service.markRead("missing")).rejects.toThrow(NotFoundException);
      expect(markAlertRead).not.toHaveBeenCalled();
    });

    it("marks an unread alert as read and returns the updated DTO", async () => {
      vi.mocked(getAlertById).mockResolvedValue(alertRow() as never);
      vi.mocked(markAlertRead).mockResolvedValue(
        alertRow({ isRead: true, readAt: new Date("2026-11-06T01:00:00.000Z") }) as never,
      );
      const service = new AlertsService();

      const result = await service.markRead("a1");

      expect(markAlertRead).toHaveBeenCalledWith({}, "a1", expect.any(Date));
      expect(result.isRead).toBe(true);
      expect(result.readAt).toBe("2026-11-06T01:00:00.000Z");
    });

    it("is idempotent: a second call against an already-read alert returns it unchanged without re-stamping readAt", async () => {
      vi.mocked(getAlertById).mockResolvedValue(
        alertRow({ isRead: true, readAt: new Date("2026-11-06T01:00:00.000Z") }) as never,
      );
      const service = new AlertsService();

      const result = await service.markRead("a1");

      expect(markAlertRead).not.toHaveBeenCalled();
      expect(result.readAt).toBe("2026-11-06T01:00:00.000Z");
    });
  });
});

describe("parseListQuery", () => {
  it("defaults isRead to undefined when not given or not a boolean literal", () => {
    expect(parseListQuery({}).isRead).toBeUndefined();
    expect(parseListQuery({ isRead: "maybe" }).isRead).toBeUndefined();
  });
});
