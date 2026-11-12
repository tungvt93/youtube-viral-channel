import { describe, expect, it, vi } from "vitest";
import { KeywordSearchesController } from "./keyword-searches.controller";
import type { KeywordSearchesService } from "./keyword-searches.service";

describe("KeywordSearchesController", () => {
  it("delegates a create to the service with the request body", async () => {
    const body = { query: "best budget cameras", marketId: "market-1", language: "en" };
    const create = vi.fn().mockResolvedValue({ id: "search-1", ...body });
    const controller = new KeywordSearchesController({ create } as unknown as KeywordSearchesService);

    const result = await controller.create(body);

    expect(create).toHaveBeenCalledWith(body);
    expect(result).toEqual({ id: "search-1", ...body });
  });

  it("delegates a list lookup to the service with the raw query params", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "search-1" }]);
    const controller = new KeywordSearchesController({ list } as unknown as KeywordSearchesService);

    const result = await controller.list("true", "10");

    expect(list).toHaveBeenCalledWith({ unseen: "true", limit: "10" });
    expect(result).toEqual([{ id: "search-1" }]);
  });

  it("passes undefined query params through when none are given", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const controller = new KeywordSearchesController({ list } as unknown as KeywordSearchesService);

    await controller.list(undefined, undefined);

    expect(list).toHaveBeenCalledWith({ unseen: undefined, limit: undefined });
  });

  it("delegates a getById lookup to the service", async () => {
    const getById = vi.fn().mockResolvedValue({ id: "search-1" });
    const controller = new KeywordSearchesController({ getById } as unknown as KeywordSearchesService);

    const result = await controller.getById("search-1");

    expect(getById).toHaveBeenCalledWith("search-1");
    expect(result).toEqual({ id: "search-1" });
  });

  it("delegates an ack to the service", async () => {
    const ack = vi.fn().mockResolvedValue({ id: "search-1", acknowledgedAt: "2026-11-06T14:00:00.000Z" });
    const controller = new KeywordSearchesController({ ack } as unknown as KeywordSearchesService);

    const result = await controller.ack("search-1");

    expect(ack).toHaveBeenCalledWith("search-1");
    expect(result).toEqual({ id: "search-1", acknowledgedAt: "2026-11-06T14:00:00.000Z" });
  });
});
