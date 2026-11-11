import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Observable } from "rxjs";
import { lastValueFrom, of, throwError } from "rxjs";

const { createAdminAuditLog } = vi.hoisted(() => ({ createAdminAuditLog: vi.fn() }));
vi.mock("@yvi/db", () => ({ createAdminAuditLog, prisma: {} }));

import { AuditLogInterceptor } from "./audit-log.interceptor";

function makeContext(request: unknown, response: unknown = { statusCode: 200 }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(observable: Observable<T>): CallHandler {
  return { handle: () => observable } as unknown as CallHandler;
}

function makeLogger() {
  return { error: vi.fn() };
}

describe("AuditLogInterceptor", () => {
  beforeEach(() => {
    createAdminAuditLog.mockReset();
  });

  it("passes a GET request through without writing an audit log", async () => {
    createAdminAuditLog.mockResolvedValue({ id: "log-1" });
    const interceptor = new AuditLogInterceptor(makeLogger() as never);
    const context = makeContext({ method: "GET", path: "/videos", user: { id: "user-1" } });

    await lastValueFrom(interceptor.intercept(context, makeHandler(of({ id: "v1" }))));

    expect(createAdminAuditLog).not.toHaveBeenCalled();
  });

  it("passes an unauthenticated mutating request through without writing an audit log", async () => {
    createAdminAuditLog.mockResolvedValue({ id: "log-1" });
    const interceptor = new AuditLogInterceptor(makeLogger() as never);
    const context = makeContext({ method: "POST", path: "/auth/login" });

    await lastValueFrom(interceptor.intercept(context, makeHandler(of({ ok: true }))));

    expect(createAdminAuditLog).not.toHaveBeenCalled();
  });

  it("writes exactly method/path/statusCode/userId/timestamp for a successful mutating request", async () => {
    createAdminAuditLog.mockResolvedValue({ id: "log-1" });
    const interceptor = new AuditLogInterceptor(makeLogger() as never);
    const context = makeContext({ method: "PATCH", path: "/alerts/alert-1/read", user: { id: "user-1" } }, { statusCode: 200 });

    await lastValueFrom(interceptor.intercept(context, makeHandler(of({ id: "alert-1" }))));

    expect(createAdminAuditLog).toHaveBeenCalledTimes(1);
    const [, input] = createAdminAuditLog.mock.calls[0];
    expect(input).toEqual({
      userId: "user-1",
      method: "PATCH",
      path: "/alerts/alert-1/read",
      statusCode: 200,
      createdAt: expect.any(Date),
    });
  });

  it("writes the error's status code and rethrows when the handler fails", async () => {
    createAdminAuditLog.mockResolvedValue({ id: "log-1" });
    const interceptor = new AuditLogInterceptor(makeLogger() as never);
    const context = makeContext({ method: "POST", path: "/discovery/queries/dq-1/run", user: { id: "user-1" } });
    const error = { getStatus: () => 404, message: "not found" };

    await expect(lastValueFrom(interceptor.intercept(context, makeHandler(throwError(() => error))))).rejects.toBe(error);

    expect(createAdminAuditLog).toHaveBeenCalledTimes(1);
    const [, input] = createAdminAuditLog.mock.calls[0];
    expect(input.statusCode).toBe(404);
  });

  it("logs but does not break the response when the audit-log write itself fails", async () => {
    createAdminAuditLog.mockRejectedValue(new Error("db down"));
    const logger = makeLogger();
    const interceptor = new AuditLogInterceptor(logger as never);
    const context = makeContext({ method: "POST", path: "/videos/v1/watchlist", user: { id: "user-1" } }, { statusCode: 204 });

    const result = await lastValueFrom(interceptor.intercept(context, makeHandler(of(undefined))));

    expect(result).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
