import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  it("stays closed while failures are below the threshold", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 1000 });
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe("closed");
    expect(() => breaker.assertCallAllowed()).not.toThrow();
  });

  it("opens after reaching the failure threshold and blocks calls", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(() => breaker.assertCallAllowed()).toThrow(/circuit breaker open/);
  });

  it("moves to half-open once the cooldown elapses, then closes on success", () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: () => now });
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");

    now = 500;
    expect(() => breaker.assertCallAllowed()).toThrow();

    now = 1500;
    expect(() => breaker.assertCallAllowed()).not.toThrow();
    expect(breaker.getState()).toBe("half_open");

    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });

  it("reopens immediately on a half-open trial failure", () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: () => now });
    breaker.recordFailure();
    now = 1500;
    breaker.assertCallAllowed();
    expect(breaker.getState()).toBe("half_open");

    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
  });

  it("resets the consecutive-failure count on success", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");
  });
});
