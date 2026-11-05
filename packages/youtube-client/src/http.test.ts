import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";
import { YouTubeApiError } from "./errors";
import { requestJson } from "./http";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeBreaker(): CircuitBreaker {
  return new CircuitBreaker({ failureThreshold: 100, cooldownMs: 1000 });
}

const noSleep = async () => undefined;
const url = new URL("https://www.googleapis.com/youtube/v3/search");

describe("requestJson", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const result = await requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep });
    expect(result).toEqual({ items: [] });
  });

  it("retries network timeouts with backoff then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }));
    const result = await requestJson(url, {
      fetchImpl,
      breaker: makeBreaker(),
      sleep: noSleep,
      maxRetries: 3,
    });
    expect(result).toEqual({ items: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws network_error after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep, maxRetries: 2 }),
    ).rejects.toMatchObject({ code: "network_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries 5xx with backoff then throws server_error after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    await expect(
      requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep, maxRetries: 1 }),
    ).rejects.toMatchObject({ code: "server_error", status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 and marks it bad_request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, {}));
    await expect(requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep })).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 429 and marks it quota_exceeded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    await expect(requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep })).rejects.toMatchObject({
      code: "quota_exceeded",
      status: 429,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies 403 quotaExceeded as quota_exceeded", async () => {
    const body = { error: { errors: [{ reason: "quotaExceeded" }] } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(403, body));
    await expect(requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep })).rejects.toMatchObject({
      code: "quota_exceeded",
      status: 403,
    });
  });

  it("classifies other 403 reasons as key_invalid", async () => {
    const body = { error: { errors: [{ reason: "keyInvalid" }] } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(403, body));
    await expect(requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep })).rejects.toMatchObject({
      code: "key_invalid",
      status: 403,
    });
  });

  it("classifies a 403 with no parseable body as key_invalid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(requestJson(url, { fetchImpl, breaker: makeBreaker(), sleep: noSleep })).rejects.toMatchObject({
      code: "key_invalid",
    });
  });

  it("blocks calls immediately when the circuit breaker is open", async () => {
    const fetchImpl = vi.fn();
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100000 });
    breaker.recordFailure();
    await expect(requestJson(url, { fetchImpl, breaker, sleep: noSleep })).rejects.toThrow(/circuit breaker open/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records a failure on the breaker for every terminal error code", async () => {
    const breaker = makeBreaker();
    const recordFailureSpy = vi.spyOn(breaker, "recordFailure");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, {}));
    await expect(requestJson(url, { fetchImpl, breaker, sleep: noSleep })).rejects.toBeInstanceOf(YouTubeApiError);
    expect(recordFailureSpy).toHaveBeenCalledTimes(1);
  });
});
