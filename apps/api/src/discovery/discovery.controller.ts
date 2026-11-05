import { Controller, Get, Param, Post } from "@nestjs/common";
import { DiscoveryService } from "./discovery.service";

@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Post("queries/:id/run")
  run(@Param("id") id: string) {
    return this.discoveryService.triggerRun(id);
  }

  @Get("jobs/:id")
  job(@Param("id") id: string) {
    return this.discoveryService.getJobStatus(id);
  }
}
