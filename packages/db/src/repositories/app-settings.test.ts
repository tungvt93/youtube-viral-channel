import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { getAiDailyBudget, getDailyBudget } from "./app-settings";

function makeDb(findUnique: (...args: unknown[]) => unknown): PrismaClient {
  return { appSetting: { findUnique } } as unknown as PrismaClient;
}

describe("getDailyBudget", () => {
  it("defaults to 10000 when no app_settings row exists", async () => {
    const db = makeDb(vi.fn().mockResolvedValue(null));
    await expect(getDailyBudget(db)).resolves.toBe(10_000);
  });

  it("returns the configured numeric value when a row exists", async () => {
    const db = makeDb(vi.fn().mockResolvedValue({ key: "youtube_daily_quota_budget", value: 5000 }));
    await expect(getDailyBudget(db)).resolves.toBe(5000);
  });

  it("falls back to the default when the stored value is not a number", async () => {
    const db = makeDb(vi.fn().mockResolvedValue({ key: "youtube_daily_quota_budget", value: "oops" }));
    await expect(getDailyBudget(db)).resolves.toBe(10_000);
  });
});

describe("getAiDailyBudget", () => {
  it("defaults to 500 when no app_settings row exists", async () => {
    const db = makeDb(vi.fn().mockResolvedValue(null));
    await expect(getAiDailyBudget(db)).resolves.toBe(500);
  });

  it("returns the configured numeric value when a row exists", async () => {
    const db = makeDb(vi.fn().mockResolvedValue({ key: "ai_daily_classification_budget", value: 1000 }));
    await expect(getAiDailyBudget(db)).resolves.toBe(1000);
  });

  it("falls back to the default when the stored value is not a number", async () => {
    const db = makeDb(vi.fn().mockResolvedValue({ key: "ai_daily_classification_budget", value: "oops" }));
    await expect(getAiDailyBudget(db)).resolves.toBe(500);
  });
});
