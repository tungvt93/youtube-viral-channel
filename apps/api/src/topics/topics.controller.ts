import { Controller, Get, Param, Query } from "@nestjs/common";
import { TopicsService } from "./topics.service";

/** PRD §10 Topic Intelligence read API — list/trends over the topics and trend snapshots the worker's classification/trend-aggregation ticks produce. */
@Controller("topics")
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  list(@Query("marketId") marketId?: string, @Query("status") status?: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.topicsService.list(marketId, status, limit, offset);
  }

  @Get(":id/trends")
  trends(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.topicsService.trends(id, limit);
  }
}
