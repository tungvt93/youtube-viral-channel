import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, Optional } from "@nestjs/common";
import { Queue } from "bullmq";
import type IORedis from "ioredis";
import { ackKeywordSearch, createKeywordSearch, finishJobRun, finishKeywordSearch, getKeywordSearchById, getMarketById, listKeywordSearchesWithMarket, prisma, startJobRun, type KeywordSearchWithMarket } from "@yvi/db";
import { QUEUE_NAMES, type KeywordSearchJobData } from "@yvi/shared";
import { createRedisConnection } from "../redis";

/** Default/maximum page size for `GET /keyword-searches` — same reasoning as `AlertsService.parseListQuery`. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** `KeywordSearch.language` is `VARCHAR(10)`, and the value is passed through as YouTube's `relevanceLanguage` — a BCP-47-shaped tag, not free text. */
const LANGUAGE_PATTERN = /^[a-zA-Z-]{2,10}$/;

export interface KeywordSearchDto {
  id: string;
  query: string;
  marketId: string;
  marketCode: string;
  language: string;
  status: "queued" | "running" | "completed" | "failed";
  videosFound: number | null;
  recommendedVideosFound: number | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  acknowledgedAt: string | null;
}

export interface CreateKeywordSearchBody {
  query?: string;
  marketId?: string;
  language?: string;
}

export interface KeywordSearchListQuery {
  unseen?: string;
  limit?: string;
}

function toDto(row: KeywordSearchWithMarket): KeywordSearchDto {
  return {
    id: row.id,
    query: row.query,
    marketId: row.marketId,
    marketCode: row.market.code,
    language: row.language,
    status: row.status as KeywordSearchDto["status"],
    videosFound: row.videosFound,
    recommendedVideosFound: row.recommendedVideosFound,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
  };
}

export interface KeywordSearchesServiceDeps {
  connection?: IORedis;
  keywordSearch?: Queue;
}

@Injectable()
export class KeywordSearchesService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly keywordSearch: Queue;

  constructor(@Optional() deps: KeywordSearchesServiceDeps = {}) {
    this.connection = deps.connection ?? createRedisConnection();
    this.keywordSearch = deps.keywordSearch ?? new Queue(QUEUE_NAMES.keywordSearch, { connection: this.connection });
  }

  /** `POST /keyword-searches` — starts the `JobRun` first so its id can be stamped onto both the `KeywordSearch` row and the enqueued job. */
  async create(body: CreateKeywordSearchBody): Promise<KeywordSearchDto> {
    const query = body?.query?.trim();
    if (!query || !body.marketId || !body.language) {
      throw new BadRequestException("query, marketId, and language are required");
    }
    if (!LANGUAGE_PATTERN.test(body.language)) {
      throw new BadRequestException("language must be a language tag such as en or pt-BR");
    }
    const market = await getMarketById(prisma, body.marketId);
    if (!market) {
      throw new NotFoundException(`market ${body.marketId} not found`);
    }
    if (!market.enabled) {
      throw new BadRequestException(`market ${body.marketId} is disabled`);
    }

    const startedAt = new Date();
    const jobRun = await startJobRun(prisma, { jobName: QUEUE_NAMES.keywordSearch, queue: QUEUE_NAMES.keywordSearch, startedAt });
    const row = await createKeywordSearch(prisma, { query, marketId: body.marketId, language: body.language, jobRunId: jobRun.id });

    const jobData: KeywordSearchJobData = { jobRunId: jobRun.id, keywordSearchId: row.id, query, marketId: body.marketId, language: body.language };
    try {
      await this.keywordSearch.add(QUEUE_NAMES.keywordSearch, jobData, { jobId: jobRun.id });
    } catch (error) {
      // Both rows exist already, so an unreachable queue must not leave them
      // stuck `queued`/`running` with no error for the user to see.
      const message = `failed to enqueue keyword search: ${String(error)}`;
      const finishedAt = new Date();
      // Each finish write is independent so a failure in one (e.g. a DB
      // hiccup) can't mask the other or replace the original enqueue error.
      try {
        await finishKeywordSearch(prisma, {
          id: row.id,
          status: "failed",
          videosFound: 0,
          recommendedVideosFound: 0,
          errorMessage: message,
          finishedAt,
        });
      } catch (finishError) {
        console.error(`failed to mark keyword search ${row.id} as failed`, finishError);
      }
      try {
        await finishJobRun(prisma, {
          id: jobRun.id,
          status: "failed",
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          resultCount: null,
          errorMessage: message,
        });
      } catch (finishError) {
        console.error(`failed to close job run ${jobRun.id} as failed`, finishError);
      }
      throw error;
    }

    return toDto(row);
  }

  /** `GET /keyword-searches` (`?unseen=true` filters to completed/failed rows not yet acknowledged). */
  async list(query: KeywordSearchListQuery): Promise<KeywordSearchDto[]> {
    const parsed = query.limit !== undefined ? Number(query.limit) : DEFAULT_LIMIT;
    const limit = Math.min(Math.max(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await listKeywordSearchesWithMarket(prisma, { unseenOnly: query.unseen === "true" }, limit);
    return rows.map(toDto);
  }

  async getById(id: string): Promise<KeywordSearchDto> {
    const row = await getKeywordSearchById(prisma, id);
    if (!row) {
      throw new NotFoundException(`keyword search ${id} not found`);
    }
    return toDto(row);
  }

  /** `POST /keyword-searches/:id/ack` — only a finished (completed/failed) search can be acknowledged. */
  async ack(id: string): Promise<KeywordSearchDto> {
    const existing = await getKeywordSearchById(prisma, id);
    if (!existing) {
      throw new NotFoundException(`keyword search ${id} not found`);
    }
    if (existing.status === "queued" || existing.status === "running") {
      throw new BadRequestException(`keyword search ${id} is still ${existing.status}`);
    }
    const updated = await ackKeywordSearch(prisma, id, new Date());
    return toDto({ ...existing, ...updated });
  }

  async onModuleDestroy(): Promise<void> {
    await this.keywordSearch.close();
    await this.connection.quit();
  }
}
