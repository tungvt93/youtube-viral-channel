import { Controller, Get, Param, Query } from "@nestjs/common";
import { ChannelsService } from "./channels.service";

/** PRD §9 Channel Intelligence read API — list/detail over the channel tiers and scores the worker's channel-scoring tick produces. */
@Controller("channels")
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  list(@Query("tier") tier?: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.channelsService.list(tier, limit, offset);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.channelsService.detail(id);
  }
}
