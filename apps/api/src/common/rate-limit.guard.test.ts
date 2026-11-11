import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitGuard } from "./rate-limit.guard";

function makeContext(user?: { id: string }): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeReflector(options: unknown): Reflector {
  return { getAllAndOverride: vi.fn().mockReturnValue(options) } as unknown as Reflector;
}

describe("RateLimitGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the request through when the route has no @RateLimit metadata", () => {
    const guard = new RateLimitGuard(makeReflector(undefined));

    expect(guard.canActivate(makeContext({ id: "user-1" }))).toBe(true);
  });

  it("allows requests up to the configured limit within the window", () => {
    const guard = new RateLimitGuard(makeReflector({ limit: 2, windowMs: 60_000 }));
    const context = makeContext({ id: "user-1" });

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects the request once the limit is exceeded within the window", () => {
    const guard = new RateLimitGuard(makeReflector({ limit: 2, windowMs: 60_000 }));
    const context = makeContext({ id: "user-1" });

    guard.canActivate(context);
    guard.canActivate(context);

    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it("tracks separate users under separate keys", () => {
    const guard = new RateLimitGuard(makeReflector({ limit: 1, windowMs: 60_000 }));

    expect(guard.canActivate(makeContext({ id: "user-1" }))).toBe(true);
    expect(guard.canActivate(makeContext({ id: "user-2" }))).toBe(true);
    expect(() => guard.canActivate(makeContext({ id: "user-1" }))).toThrow(HttpException);
  });

  it("allows another request again once the window has passed", () => {
    const guard = new RateLimitGuard(makeReflector({ limit: 1, windowMs: 60_000 }));
    const context = makeContext({ id: "user-1" });

    guard.canActivate(context);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    vi.setSystemTime(new Date("2026-11-06T00:01:01.000Z"));

    expect(guard.canActivate(context)).toBe(true);
  });
});
