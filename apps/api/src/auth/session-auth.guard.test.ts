import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveSessionByToken } from "@yvi/db";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SessionAuthGuard } from "./session-auth.guard";

vi.mock("@yvi/db", () => ({
  getActiveSessionByToken: vi.fn(),
  prisma: {},
}));

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = { headers };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("SessionAuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a route marked @Public() without checking the session", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector);

    const result = await guard.canActivate(makeContext({}));

    expect(result).toBe(true);
    expect(getActiveSessionByToken).not.toHaveBeenCalled();
  });

  it("checks IS_PUBLIC_KEY metadata on both the handler and the class", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector);
    const context = makeContext({});

    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
  });

  it("rejects when the x-session-token header is missing", async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector);

    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(UnauthorizedException);
    expect(getActiveSessionByToken).not.toHaveBeenCalled();
  });

  it("rejects when the session token does not match an active session", async () => {
    vi.mocked(getActiveSessionByToken).mockResolvedValue(null);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector);

    await expect(guard.canActivate(makeContext({ "x-session-token": "garbage" }))).rejects.toThrow(UnauthorizedException);
  });

  it("accepts a valid session token and attaches the user to the request", async () => {
    const user = { id: "user-1", email: "admin@example.com", role: "admin" };
    vi.mocked(getActiveSessionByToken).mockResolvedValue({ user } as never);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector);
    const context = makeContext({ "x-session-token": "token-abc" });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect((context.switchToHttp().getRequest() as { user?: unknown }).user).toEqual(user);
  });
});
