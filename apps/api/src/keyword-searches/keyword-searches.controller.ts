import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { RateLimit } from "../common/rate-limit.decorator";
import { KeywordSearchesService, type CreateKeywordSearchBody } from "./keyword-searches.service";

@Controller("keyword-searches")
export class KeywordSearchesController {
  constructor(private readonly keywordSearchesService: KeywordSearchesService) {}

  @Post()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  create(@Body() body: CreateKeywordSearchBody) {
    return this.keywordSearchesService.create(body);
  }

  @Get()
  list(@Query("unseen") unseen?: string, @Query("limit") limit?: string) {
    return this.keywordSearchesService.list({ unseen, limit });
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.keywordSearchesService.getById(id);
  }

  @Post(":id/ack")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  ack(@Param("id") id: string) {
    return this.keywordSearchesService.ack(id);
  }
}
