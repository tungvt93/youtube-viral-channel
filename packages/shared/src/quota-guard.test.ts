import { describe, expect, it } from "vitest";
import { evaluateQuotaGuard } from "./quota-guard";

describe("evaluateQuotaGuard", () => {
  it("allows a job that stays within budget", () => {
    const decision = evaluateQuotaGuard({ dailyBudget: 10_000, usedToday: 5_000, estimatedCost: 100 });
    expect(decision).toEqual({ allowed: true, remaining: 5_000, projectedUsage: 5_100 });
  });

  it("allows a job that lands exactly on the budget", () => {
    const decision = evaluateQuotaGuard({ dailyBudget: 10_000, usedToday: 9_900, estimatedCost: 100 });
    expect(decision.allowed).toBe(true);
    expect(decision.projectedUsage).toBe(10_000);
  });

  it("blocks a job that would exceed the budget", () => {
    const decision = evaluateQuotaGuard({ dailyBudget: 10_000, usedToday: 9_950, estimatedCost: 100 });
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(50);
  });

  it("blocks when the budget is already exhausted", () => {
    const decision = evaluateQuotaGuard({ dailyBudget: 10_000, usedToday: 10_000, estimatedCost: 1 });
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });
});
