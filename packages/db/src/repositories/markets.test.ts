import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import { getMarketByCode, getMarketById, listAllMarkets, listEnabledMarkets, updateMarketEnabled } from "./markets";

describe("listEnabledMarkets", () => {
  it("only selects enabled markets", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { market: { findMany } } as unknown as PrismaClient;

    await listEnabledMarkets(db);

    expect(findMany).toHaveBeenCalledWith({ where: { enabled: true } });
  });
});

describe("getMarketById", () => {
  it("looks up a market by its id", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "market-1" });
    const db = { market: { findUnique } } as unknown as PrismaClient;

    await getMarketById(db, "market-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "market-1" } });
  });
});

describe("getMarketByCode", () => {
  it("looks up a market by its two-letter code", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "market-1", code: "US" });
    const db = { market: { findUnique } } as unknown as PrismaClient;

    await getMarketByCode(db, "US");

    expect(findUnique).toHaveBeenCalledWith({ where: { code: "US" } });
  });
});

describe("listAllMarkets", () => {
  it("selects every market, including disabled ones, ordered by code", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { market: { findMany } } as unknown as PrismaClient;

    await listAllMarkets(db);

    expect(findMany).toHaveBeenCalledWith({ orderBy: { code: "asc" } });
  });
});

describe("updateMarketEnabled", () => {
  it("writes only the enabled flag for the given market id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "market-1", enabled: false });
    const db = { market: { update } } as unknown as PrismaClient;

    await updateMarketEnabled(db, "market-1", false);

    expect(update).toHaveBeenCalledWith({ where: { id: "market-1" }, data: { enabled: false } });
  });
});
