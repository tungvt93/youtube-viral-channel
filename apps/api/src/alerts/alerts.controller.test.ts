import { describe, expect, it, vi } from "vitest";
import { AlertsController } from "./alerts.controller";
import type { AlertsService } from "./alerts.service";

describe("AlertsController", () => {
  it("delegates a list lookup to the service with the raw query params", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const controller = new AlertsController({ list } as unknown as AlertsService);

    await controller.list("true", "10", "5");

    expect(list).toHaveBeenCalledWith({ isRead: "true", limit: "10", offset: "5" });
  });

  it("delegates a mark-read to the service with the id", async () => {
    const markRead = vi.fn().mockResolvedValue({ id: "a1", isRead: true });
    const controller = new AlertsController({ markRead } as unknown as AlertsService);

    const result = await controller.markRead("a1");

    expect(markRead).toHaveBeenCalledWith("a1");
    expect(result).toEqual({ id: "a1", isRead: true });
  });
});
