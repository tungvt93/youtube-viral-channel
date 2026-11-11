import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import { createSession, deleteSession, findUserByEmail, getActiveSessionByToken } from "@yvi/db";
import { AuthService } from "./auth.service";

vi.mock("@yvi/db", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  findUserByEmail: vi.fn(),
  getActiveSessionByToken: vi.fn(),
  prisma: {},
}));

vi.mock("argon2", () => ({
  verify: vi.fn(),
}));

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("rejects an unknown email without revealing whether the account exists", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue(null);
      const service = new AuthService();

      await expect(service.login("missing@example.com", "whatever")).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it("rejects a wrong password", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", email: "admin@example.com", passwordHash: "hash", role: "admin" } as never);
      vi.mocked(argon2.verify).mockResolvedValue(false);
      const service = new AuthService();

      await expect(service.login("admin@example.com", "wrong")).rejects.toThrow(UnauthorizedException);
      expect(createSession).not.toHaveBeenCalled();
    });

    it("treats an argon2 verify error the same as a wrong password, not a 500", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", email: "admin@example.com", passwordHash: "not-a-valid-hash", role: "admin" } as never);
      vi.mocked(argon2.verify).mockRejectedValue(new Error("invalid hash"));
      const service = new AuthService();

      await expect(service.login("admin@example.com", "whatever")).rejects.toThrow(UnauthorizedException);
    });

    it("creates a session and returns the token/user on a correct password", async () => {
      vi.mocked(findUserByEmail).mockResolvedValue({ id: "user-1", email: "admin@example.com", passwordHash: "hash", role: "admin" } as never);
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(createSession).mockResolvedValue({} as never);
      const service = new AuthService();

      const result = await service.login("admin@example.com", "correct");

      expect(createSession).toHaveBeenCalledWith({}, expect.objectContaining({ userId: "user-1" }));
      expect(result.user).toEqual({ id: "user-1", email: "admin@example.com", role: "admin" });
      expect(result.sessionToken).toHaveLength(64);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("logout", () => {
    it("deletes the session by token", async () => {
      const service = new AuthService();

      await service.logout("token-abc");

      expect(deleteSession).toHaveBeenCalledWith({}, "token-abc");
    });
  });

  describe("me", () => {
    it("rejects when no token is given", async () => {
      const service = new AuthService();

      await expect(service.me(undefined)).rejects.toThrow(UnauthorizedException);
      expect(getActiveSessionByToken).not.toHaveBeenCalled();
    });

    it("rejects when the token does not match an active session", async () => {
      vi.mocked(getActiveSessionByToken).mockResolvedValue(null);
      const service = new AuthService();

      await expect(service.me("garbage")).rejects.toThrow(UnauthorizedException);
    });

    it("returns the user for a valid session", async () => {
      vi.mocked(getActiveSessionByToken).mockResolvedValue({ user: { id: "user-1", email: "admin@example.com", role: "admin" } } as never);
      const service = new AuthService();

      const result = await service.me("token-abc");

      expect(result).toEqual({ id: "user-1", email: "admin@example.com", role: "admin" });
    });
  });
});
