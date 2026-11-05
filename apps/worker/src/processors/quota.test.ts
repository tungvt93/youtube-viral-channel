import { describe, expect, it, vi } from "vitest";

const { getDailyBudget, sumTodayQuotaUsage, getAiDailyBudget, sumTodayAiUsage } = vi.hoisted(() => ({
  getDailyBudget: vi.fn(),
  sumTodayQuotaUsage: vi.fn(),
  getAiDailyBudget: vi.fn(),
  sumTodayAiUsage: vi.fn(),
}));
vi.mock("@yvi/db", () => ({ getDailyBudget, sumTodayQuotaUsage, getAiDailyBudget, sumTodayAiUsage }));

import { checkAiBudgetGuard, checkQuotaGuard } from "./quota";

describe("checkQuotaGuard", () => {
  it("allows a job that fits within the remaining daily budget", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(500);

    const decision = await checkQuotaGuard({} as never, 100, new Date("2026-11-05T00:00:00Z"));

    expect(decision).toEqual({ allowed: true, remaining: 9500, projectedUsage: 600 });
  });

  it("blocks a job that would push usage over the daily budget", async () => {
    getDailyBudget.mockResolvedValue(10_000);
    sumTodayQuotaUsage.mockResolvedValue(9950);

    const decision = await checkQuotaGuard({} as never, 100, new Date("2026-11-05T00:00:00Z"));

    expect(decision.allowed).toBe(false);
  });
});

describe("checkAiBudgetGuard", () => {
  it("allows a job that fits within the remaining daily AI budget", async () => {
    getAiDailyBudget.mockResolvedValue(1_000);
    sumTodayAiUsage.mockResolvedValue(50);

    const decision = await checkAiBudgetGuard({} as never, 10, new Date("2026-11-05T00:00:00Z"));

    expect(decision).toEqual({ allowed: true, remaining: 950, projectedUsage: 60 });
  });

  it("blocks a job that would push AI usage over the daily budget", async () => {
    getAiDailyBudget.mockResolvedValue(1_000);
    sumTodayAiUsage.mockResolvedValue(995);

    const decision = await checkAiBudgetGuard({} as never, 10, new Date("2026-11-05T00:00:00Z"));

    expect(decision.allowed).toBe(false);
  });
});
