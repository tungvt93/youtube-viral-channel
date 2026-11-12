import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ackKeywordSearch, createKeywordSearch, getKeywordSearchById, getMarketById, listKeywordSearchesWithMarket, startJobRun } = vi.hoisted(() => ({
  ackKeywordSearch: vi.fn(),
  createKeywordSearch: vi.fn(),
  getKeywordSearchById: vi.fn(),
  getMarketById: vi.fn(),
  listKeywordSearchesWithMarket: vi.fn(),
  startJobRun: vi.fn(),
}));

vi.mock("@yvi/db", () => ({
  prisma: {},
  ackKeywordSearch,
  createKeywordSearch,
  getKeywordSearchById,
  getMarketById,
  listKeywordSearchesWithMarket,
  startJobRun,
}));

import { KeywordSearchesService } from "./keyword-searches.service";

function makeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
}

function makeService(keywordSearch = makeQueue()) {
  return new KeywordSearchesService({ keywordSearch: keywordSearch as never });
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "search-1",
    query: "best budget cameras",
    marketId: "market-1",
    language: "en",
    status: "queued",
    videosFound: null,
    recommendedVideosFound: null,
    errorMessage: null,
    createdAt: new Date("2026-11-06T12:00:00.000Z"),
    finishedAt: null,
    acknowledgedAt: null,
    market: { id: "market-1", code: "US" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KeywordSearchesService", () => {
  describe("create", () => {
    it.each([
      ["query", { marketId: "market-1", language: "en" }],
      ["marketId", { query: "q", language: "en" }],
      ["language", { query: "q", marketId: "market-1" }],
    ])("rejects with BadRequestException when %s is missing", async (_field, body) => {
      const service = makeService();

      await expect(service.create(body)).rejects.toThrow(BadRequestException);
      expect(getMarketById).not.toHaveBeenCalled();
    });

    it("rejects with NotFoundException when the market does not exist", async () => {
      getMarketById.mockResolvedValue(null);
      const service = makeService();

      await expect(service.create({ query: "q", marketId: "missing", language: "en" })).rejects.toThrow(NotFoundException);
      expect(createKeywordSearch).not.toHaveBeenCalled();
    });

    it("rejects with BadRequestException when the market is disabled", async () => {
      getMarketById.mockResolvedValue({ id: "market-1", code: "US", enabled: false });
      const service = makeService();

      await expect(service.create({ query: "q", marketId: "market-1", language: "en" })).rejects.toThrow(BadRequestException);
      expect(createKeywordSearch).not.toHaveBeenCalled();
    });

    it("creates the KeywordSearch row, starts a JobRun, and enqueues the job with matching ids", async () => {
      getMarketById.mockResolvedValue({ id: "market-1", code: "US", enabled: true });
      startJobRun.mockResolvedValue({ id: "job-run-1" });
      createKeywordSearch.mockResolvedValue(makeRow({ jobRunId: "job-run-1" }));
      const keywordSearch = makeQueue();
      const service = makeService(keywordSearch);

      const result = await service.create({ query: "best budget cameras", marketId: "market-1", language: "en" });

      expect(startJobRun).toHaveBeenCalledWith({}, expect.objectContaining({ jobName: "keyword-search", queue: "keyword-search" }));
      expect(createKeywordSearch).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ query: "best budget cameras", marketId: "market-1", language: "en", jobRunId: "job-run-1" }),
      );
      expect(keywordSearch.add).toHaveBeenCalledWith(
        "keyword-search",
        { jobRunId: "job-run-1", keywordSearchId: "search-1", query: "best budget cameras", marketId: "market-1", language: "en" },
        { jobId: "job-run-1" },
      );
      expect(result).toEqual(
        expect.objectContaining({ id: "search-1", query: "best budget cameras", marketId: "market-1", marketCode: "US", language: "en" }),
      );
    });
  });

  describe("list", () => {
    it("returns DTOs ordered as the repository returns them", async () => {
      listKeywordSearchesWithMarket.mockResolvedValue([
        makeRow({ id: "search-2", createdAt: new Date("2026-11-06T13:00:00.000Z") }),
        makeRow({ id: "search-1", createdAt: new Date("2026-11-06T12:00:00.000Z") }),
      ]);
      const service = makeService();

      const result = await service.list({});

      expect(result.map((r) => r.id)).toEqual(["search-2", "search-1"]);
    });

    it("passes unseen=true through to listKeywordSearchesWithMarket's unseenOnly filter", async () => {
      listKeywordSearchesWithMarket.mockResolvedValue([]);
      const service = makeService();

      await service.list({ unseen: "true" });

      expect(listKeywordSearchesWithMarket).toHaveBeenCalledWith({}, { unseenOnly: true }, expect.any(Number));
    });
  });

  describe("getById", () => {
    it("throws NotFoundException for an unknown id", async () => {
      getKeywordSearchById.mockResolvedValue(null);
      const service = makeService();

      await expect(service.getById("missing")).rejects.toThrow(NotFoundException);
    });

    it("returns a DTO for a known id", async () => {
      getKeywordSearchById.mockResolvedValue(makeRow());
      const service = makeService();

      const result = await service.getById("search-1");

      expect(result.id).toBe("search-1");
    });
  });

  describe("ack", () => {
    it.each(["queued", "running"])("rejects with BadRequestException when the search is %s", async (status) => {
      getKeywordSearchById.mockResolvedValue(makeRow({ status }));
      const service = makeService();

      await expect(service.ack("search-1")).rejects.toThrow(BadRequestException);
      expect(ackKeywordSearch).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for an unknown id", async () => {
      getKeywordSearchById.mockResolvedValue(null);
      const service = makeService();

      await expect(service.ack("missing")).rejects.toThrow(NotFoundException);
    });

    it.each(["completed", "failed"])("calls ackKeywordSearch and returns the updated DTO when the search is %s", async (status) => {
      getKeywordSearchById.mockResolvedValue(makeRow({ status }));
      const acknowledgedAt = new Date("2026-11-06T14:00:00.000Z");
      ackKeywordSearch.mockResolvedValue(makeRow({ status, acknowledgedAt }));
      const service = makeService();

      const result = await service.ack("search-1");

      expect(ackKeywordSearch).toHaveBeenCalledWith({}, "search-1", expect.any(Date));
      expect(result.acknowledgedAt).toBe(acknowledgedAt.toISOString());
    });
  });
});
