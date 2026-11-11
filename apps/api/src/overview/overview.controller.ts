import { Controller, Get, Query } from "@nestjs/common";
import { OverviewService } from "./overview.service";

/** PRD §13.2 Overview dashboard read API — aggregates over the videos/channels/topics/discovery-events tables the worker's pipeline already populates. */
@Controller("overview")
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get("summary")
  summary() {
    return this.overviewService.summary();
  }

  @Get("discovery-volume")
  discoveryVolume(@Query("days") days?: string) {
    return this.overviewService.discoveryVolume(days);
  }

  @Get("top-signals")
  topSignals(@Query("limit") limit?: string) {
    return this.overviewService.topSignals(limit);
  }
}
