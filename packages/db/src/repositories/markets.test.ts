import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { getMarketByCode } from "./markets";

describe("getMarketByCode", () => {
  it("looks up a market by its two-letter code", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "market-1", code: "US" });
    const db = { market: { findUnique } } as unknown as PrismaClient;

    await getMarketByCode(db, "US");

    expect(findUnique).toHaveBeenCalledWith({ where: { code: "US" } });
  });
});
