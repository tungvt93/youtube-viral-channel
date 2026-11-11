import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { findUserByEmail } from "./users";

describe("findUserByEmail", () => {
  it("looks up a user by email", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "user-1", email: "admin@example.com" });
    const db = { user: { findUnique } } as unknown as PrismaClient;

    const result = await findUserByEmail(db, "admin@example.com");

    expect(findUnique).toHaveBeenCalledWith({ where: { email: "admin@example.com" } });
    expect(result).toEqual({ id: "user-1", email: "admin@example.com" });
  });

  it("returns null when no user matches", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const db = { user: { findUnique } } as unknown as PrismaClient;

    const result = await findUserByEmail(db, "missing@example.com");

    expect(result).toBeNull();
  });
});
