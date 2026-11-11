import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { createAdminAuditLog } from "./admin-audit-logs";

describe("createAdminAuditLog", () => {
  it("inserts exactly the given method/path/statusCode/userId/timestamp, nothing else", async () => {
    const input = { userId: "user-1", method: "POST", path: "/discovery/queries", statusCode: 201, createdAt: new Date("2026-11-06T12:00:00.000Z") };
    const created = { id: "log-1", ...input };
    const create = vi.fn().mockResolvedValue(created);
    const db = { adminAuditLog: { create } } as unknown as PrismaClient;

    await expect(createAdminAuditLog(db, input)).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({ data: input });
  });
});
