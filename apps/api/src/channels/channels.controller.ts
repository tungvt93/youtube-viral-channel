import { Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import type { ActiveSessionWithUser } from "@yvi/db";
import { CurrentUser } from "../auth/current-user.decorator";
import { RateLimit } from "../common/rate-limit.decorator";
import { ChannelsService } from "./channels.service";

type RequestUser = ActiveSessionWithUser["user"];

/** PRD §9 Channel Intelligence read API — list/detail over the channel tiers and scores the worker's channel-scoring tick produces. */
@Controller("channels")
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  list(
    @Query("tier") tier?: string,
    @Query("watchlistedOnly") watchlistedOnly?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.channelsService.list(tier, limit, offset, watchlistedOnly, user?.id);
  }

  @Get(":id")
  detail(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    return this.channelsService.detail(id, user?.id);
  }

  @Post(":id/watchlist")
  @HttpCode(204)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  star(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.channelsService.star(id, user.id);
  }

  @Delete(":id/watchlist")
  @HttpCode(204)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  unstar(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.channelsService.unstar(id, user.id);
  }
}
