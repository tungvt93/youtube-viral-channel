import { describe, expect, it } from "vitest";
import { backoffWithJitter } from "./retry";

describe("backoffWithJitter", () => {
  it("returns a value within [0, baseMs] for attempt 1", () => {
    const delay = backoffWithJitter(1, 200, 5000);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(200);
  });

  it("caps the delay at maxMs for large attempts", () => {
    const delay = backoffWithJitter(20, 200, 5000);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
