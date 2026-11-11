import type { ArgumentsHost } from "@nestjs/common";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

function makeHost(request: { id?: string; method: string; url: string }) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makeLogger() {
  return { error: vi.fn(), warn: vi.fn() } as unknown as { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
}

describe("HttpExceptionFilter", () => {
  it("maps a NotFoundException to the unified error shape with the request id", () => {
    const logger = makeLogger();
    const filter = new HttpExceptionFilter(logger as never);
    const { host, status, json } = makeHost({ id: "req-1", method: "GET", url: "/videos/missing" });

    filter.catch(new NotFoundException("video missing not found"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      code: "NOT_FOUND",
      message: "video missing not found",
      details: null,
      requestId: "req-1",
    });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("surfaces class-level validation details on a BadRequestException object response", () => {
    const logger = makeLogger();
    const filter = new HttpExceptionFilter(logger as never);
    const { host, json } = makeHost({ id: "req-2", method: "POST", url: "/discovery/queries" });

    filter.catch(new BadRequestException({ message: "invalid body", fields: ["query"] }), host);

    expect(json).toHaveBeenCalledWith({
      code: "BAD_REQUEST",
      message: "invalid body",
      details: { fields: ["query"] },
      requestId: "req-2",
    });
  });

  it("never leaks the raw message of an unhandled non-HttpException error, and logs it instead", () => {
    const logger = makeLogger();
    const filter = new HttpExceptionFilter(logger as never);
    const { host, status, json } = makeHost({ id: "req-3", method: "GET", url: "/system/health" });

    filter.catch(new Error("DATABASE_URL=postgres://secret leaked"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      details: null,
      requestId: "req-3",
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][0]).toContain("DATABASE_URL=postgres://secret leaked");
  });

  it("works without a request id (e.g. pino-http not attached)", () => {
    const logger = makeLogger();
    const filter = new HttpExceptionFilter(logger as never);
    const { host, json } = makeHost({ method: "GET", url: "/system/health" });

    filter.catch(new NotFoundException("x"), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ requestId: undefined }));
  });
});
