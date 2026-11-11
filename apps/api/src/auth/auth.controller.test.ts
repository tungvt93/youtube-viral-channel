import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";

describe("AuthController", () => {
  let authService: { login: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn>; me: ReturnType<typeof vi.fn> };
  let controller: AuthController;

  beforeEach(() => {
    authService = { login: vi.fn(), logout: vi.fn(), me: vi.fn() };
    controller = new AuthController(authService as unknown as AuthService);
  });

  describe("login", () => {
    it("rejects a body missing email or password without calling the service", () => {
      expect(() => controller.login({})).toThrow(BadRequestException);
      expect(() => controller.login({ email: "a@b.com" })).toThrow(BadRequestException);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it("delegates to the service for a well-formed body", () => {
      controller.login({ email: "admin@example.com", password: "secret" });

      expect(authService.login).toHaveBeenCalledWith("admin@example.com", "secret");
    });
  });

  describe("logout", () => {
    it("is a no-op when no session token header is present", async () => {
      await controller.logout(undefined);

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it("delegates to the service when a session token header is present", async () => {
      await controller.logout("token-abc");

      expect(authService.logout).toHaveBeenCalledWith("token-abc");
    });
  });

  describe("me", () => {
    it("delegates to the service with the header value, including when absent", () => {
      controller.me(undefined);
      controller.me("token-abc");

      expect(authService.me).toHaveBeenNthCalledWith(1, undefined);
      expect(authService.me).toHaveBeenNthCalledWith(2, "token-abc");
    });
  });
});
