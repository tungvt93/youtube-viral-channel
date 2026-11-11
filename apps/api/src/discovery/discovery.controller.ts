import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RateLimit } from "../common/rate-limit.decorator";
import { DiscoveryService, type CreateDiscoveryQueryBody, type UpdateDiscoveryQueryBody } from "./discovery.service";

@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("queries")
  listQueries() {
    return this.discoveryService.listQueries();
  }

  @Post("queries")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  createQuery(@Body() body: CreateDiscoveryQueryBody) {
    return this.discoveryService.createQuery(body);
  }

  @Patch("queries/:id")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  updateQuery(@Param("id") id: string, @Body() body: UpdateDiscoveryQueryBody) {
    return this.discoveryService.updateQuery(id, body);
  }

  @Post("queries/:id/run")
  @RateLimit({ limit: 10, windowMs: 60_000 })
  run(@Param("id") id: string) {
    return this.discoveryService.triggerRun(id);
  }

  @Get("jobs")
  jobs(@Query("limit") limit?: string) {
    return this.discoveryService.listJobs(limit);
  }

  @Get("jobs/:id")
  job(@Param("id") id: string) {
    return this.discoveryService.getJobStatus(id);
  }
}
