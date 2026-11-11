import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { createAlertIfDue, getAlertById, listAlerts, markAlertRead } from "./alerts";

const input = {
  alertType: "video_high_signal",
  entityType: "video",
  entityId: "video-1",
  message: '"Some Video" entered high signal state',
  severity: "info",
  triggeredAt: new Date("2026-11-06T12:00:00.000Z"),
};
const cooldownMs = 24 * 60 * 60 * 1000;

describe("createAlertIfDue", () => {
  it("skips the insert and returns null when a row already fired within the cooldown window", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "alert-1", ...input });
    const create = vi.fn();
    const db = { alert: { findFirst, create } } as unknown as PrismaClient;

    await expect(createAlertIfDue(db, input, cooldownMs)).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        alertType: input.alertType,
        entityType: input.entityType,
        entityId: input.entityId,
        triggeredAt: { gte: new Date(input.triggeredAt.getTime() - cooldownMs) },
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("inserts and returns the new row when no prior alert fired within the cooldown window", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const created = { id: "alert-1", ...input };
    const create = vi.fn().mockResolvedValue(created);
    const db = { alert: { findFirst, create } } as unknown as PrismaClient;

    await expect(createAlertIfDue(db, input, cooldownMs)).resolves.toEqual(created);

    expect(create).toHaveBeenCalledWith({ data: input });
  });
});

describe("listAlerts", () => {
  it("lists newest-triggered-first with offset/limit and no isRead filter by default", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { alert: { findMany } } as unknown as PrismaClient;

    await listAlerts(db, { limit: 20, offset: 0 });

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { triggeredAt: "desc" },
      take: 20,
      skip: 0,
    });
  });

  it("filters by isRead when provided", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { alert: { findMany } } as unknown as PrismaClient;

    await listAlerts(db, { isRead: false, limit: 20, offset: 0 });

    expect(findMany).toHaveBeenCalledWith({
      where: { isRead: false },
      orderBy: { triggeredAt: "desc" },
      take: 20,
      skip: 0,
    });
  });
});

describe("getAlertById", () => {
  it("returns the matching row", async () => {
    const found = { id: "alert-1", ...input };
    const findUnique = vi.fn().mockResolvedValue(found);
    const db = { alert: { findUnique } } as unknown as PrismaClient;

    await expect(getAlertById(db, "alert-1")).resolves.toEqual(found);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "alert-1" } });
  });

  it("returns null when no row matches", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = { alert: { findUnique } } as unknown as PrismaClient;

    await expect(getAlertById(db, "missing")).resolves.toBeNull();
  });
});

describe("markAlertRead", () => {
  it("sets isRead and readAt", async () => {
    const readAt = new Date("2026-11-06T13:00:00.000Z");
    const updated = { id: "alert-1", ...input, isRead: true, readAt };
    const update = vi.fn().mockResolvedValue(updated);
    const db = { alert: { update } } as unknown as PrismaClient;

    await expect(markAlertRead(db, "alert-1", readAt)).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({ where: { id: "alert-1" }, data: { isRead: true, readAt } });
  });
});
