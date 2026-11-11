import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { createSession, deleteSession, getActiveSessionByToken } from "./sessions";

describe("createSession", () => {
  it("creates a session row with the given token/expiry", async () => {
    const create = vi.fn().mockResolvedValue({ id: "session-1" });
    const db = { session: { create } } as unknown as PrismaClient;
    const expiresAt = new Date("2026-11-13T00:00:00Z");

    await createSession(db, { userId: "user-1", sessionToken: "token-abc", expiresAt });

    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", sessionToken: "token-abc", expiresAt },
    });
  });
});

describe("getActiveSessionByToken", () => {
  it("returns the session with its user when not expired", async () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const session = { sessionToken: "token-abc", expiresAt: new Date("2026-11-13T00:00:00Z"), user: { id: "user-1" } };
    const findUnique = vi.fn().mockResolvedValue(session);
    const db = { session: { findUnique } } as unknown as PrismaClient;

    const result = await getActiveSessionByToken(db, "token-abc", now);

    expect(findUnique).toHaveBeenCalledWith({ where: { sessionToken: "token-abc" }, include: { user: true } });
    expect(result).toEqual(session);
  });

  it("returns null when the session is expired", async () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const session = { sessionToken: "token-abc", expiresAt: new Date("2026-11-01T00:00:00Z"), user: { id: "user-1" } };
    const findUnique = vi.fn().mockResolvedValue(session);
    const db = { session: { findUnique } } as unknown as PrismaClient;

    const result = await getActiveSessionByToken(db, "token-abc", now);

    expect(result).toBeNull();
  });

  it("returns null when no session matches the token", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = { session: { findUnique } } as unknown as PrismaClient;

    const result = await getActiveSessionByToken(db, "garbage", new Date());

    expect(result).toBeNull();
  });
});

describe("deleteSession", () => {
  it("deletes by token without erroring on a missing/garbage token", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = { session: { deleteMany } } as unknown as PrismaClient;

    await deleteSession(db, "garbage");

    expect(deleteMany).toHaveBeenCalledWith({ where: { sessionToken: "garbage" } });
  });
});
