import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  createDiscoveryQuery,
  getDiscoveryQueryById,
  listDiscoveryQueriesWithMarket,
  listEnabledDiscoveryQueriesWithMarket,
  touchDiscoveryQueryLastRunAt,
  updateDiscoveryQuery,
  type CreateDiscoveryQueryInput,
} from "./discovery-queries";

describe("getDiscoveryQueryById", () => {
  it("looks up a discovery query by id, including its market", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "query-1" });
    const db = { discoveryQuery: { findUnique } } as unknown as PrismaClient;

    await getDiscoveryQueryById(db, "query-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "query-1" }, include: { market: true } });
  });
});

describe("listEnabledDiscoveryQueriesWithMarket", () => {
  it("only selects enabled queries whose market is also enabled", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { discoveryQuery: { findMany } } as unknown as PrismaClient;

    await listEnabledDiscoveryQueriesWithMarket(db);

    expect(findMany).toHaveBeenCalledWith({
      where: { enabled: true, market: { enabled: true } },
      include: { market: true },
    });
  });
});

describe("listDiscoveryQueriesWithMarket", () => {
  it("selects every discovery query, including disabled ones, newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { discoveryQuery: { findMany } } as unknown as PrismaClient;

    await listDiscoveryQueriesWithMarket(db);

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      include: { market: true },
    });
  });
});

describe("touchDiscoveryQueryLastRunAt", () => {
  it("writes lastRunAt for the given query id", async () => {
    const update = vi.fn().mockResolvedValue({ id: "query-1" });
    const db = { discoveryQuery: { update } } as unknown as PrismaClient;
    const lastRunAt = new Date("2026-11-06T12:00:00Z");

    await touchDiscoveryQueryLastRunAt(db, "query-1", lastRunAt);

    expect(update).toHaveBeenCalledWith({ where: { id: "query-1" }, data: { lastRunAt } });
  });
});

const baseCreateInput: CreateDiscoveryQueryInput = {
  marketId: "market-1",
  topicId: null,
  query: "viral shorts",
  language: "en",
  strategy: "search",
  priority: 5,
  maxPagesPerRun: 3,
  frequencyMinutes: 60,
  enabled: true,
};

describe("createDiscoveryQuery", () => {
  it("creates a discovery query with the given fields, returning its market", async () => {
    const create = vi.fn().mockResolvedValue({ id: "query-1", ...baseCreateInput });
    const db = { discoveryQuery: { create } } as unknown as PrismaClient;

    await createDiscoveryQuery(db, baseCreateInput);

    expect(create).toHaveBeenCalledWith({ data: baseCreateInput, include: { market: true } });
  });
});

describe("updateDiscoveryQuery", () => {
  it("writes only the given typed fields, never a raw config column", async () => {
    const update = vi.fn().mockResolvedValue({ id: "query-1" });
    const db = { discoveryQuery: { update } } as unknown as PrismaClient;

    await updateDiscoveryQuery(db, "query-1", { priority: 8, enabled: false });

    expect(update).toHaveBeenCalledWith({
      where: { id: "query-1" },
      data: { priority: 8, enabled: false },
      include: { market: true },
    });
  });
});
