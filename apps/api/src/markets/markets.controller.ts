import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { RateLimit } from "../common/rate-limit.decorator";
import { MarketsService, type UpdateMarketBody } from "./markets.service";

/** PRD §11.2/§16.2 Market Management read/write API. */
@Controller("markets")
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  list() {
    return this.marketsService.list();
  }

  @Patch(":id")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  update(@Param("id") id: string, @Body() body: UpdateMarketBody) {
    return this.marketsService.update(id, body);
  }

  @Get(":id/health")
  health(@Param("id") id: string) {
    return this.marketsService.health(id);
  }
}
