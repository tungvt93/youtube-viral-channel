import { beforeEach, describe, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import { seedAdminUser } from "./seed";

vi.mock("argon2", () => ({
  hash: vi.fn(),
}));

describe("seedAdminUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("skips with a warning and does not touch the database when ADMIN_EMAIL is absent", async () => {
    const upsert = vi.fn();
    const db = { user: { upsert } } as never;

    await seedAdminUser(db, { ADMIN_PASSWORD: "super-secret" });

    expect(upsert).not.toHaveBeenCalled();
    expect(argon2.hash).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("skipping"));
  });

  it("skips with a warning and does not touch the database when ADMIN_PASSWORD is absent", async () => {
    const upsert = vi.fn();
    const db = { user: { upsert } } as never;

    await seedAdminUser(db, { ADMIN_EMAIL: "admin@example.com" });

    expect(upsert).not.toHaveBeenCalled();
    expect(argon2.hash).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("skipping"));
  });

  it("skips with a warning when both are absent", async () => {
    const upsert = vi.fn();
    const db = { user: { upsert } } as never;

    await seedAdminUser(db, {});

    expect(upsert).not.toHaveBeenCalled();
  });

  it("skips when ADMIN_PASSWORD is an empty string rather than hashing a blank password", async () => {
    const upsert = vi.fn();
    const db = { user: { upsert } } as never;

    await seedAdminUser(db, { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "" });

    expect(upsert).not.toHaveBeenCalled();
    expect(argon2.hash).not.toHaveBeenCalled();
  });

  it("hashes the password and upserts the admin user by email when both env vars are set", async () => {
    vi.mocked(argon2.hash).mockResolvedValue("hashed-password");
    const upsert = vi.fn().mockResolvedValue({});
    const db = { user: { upsert } } as never;

    await seedAdminUser(db, { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "super-secret" });

    expect(argon2.hash).toHaveBeenCalledWith("super-secret");
    expect(upsert).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      create: { email: "admin@example.com", passwordHash: "hashed-password", role: "admin" },
      update: { passwordHash: "hashed-password" },
    });
  });
});
