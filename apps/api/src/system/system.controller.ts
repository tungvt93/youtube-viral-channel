import { Controller, Get, Query } from "@nestjs/common";
import { SystemService } from "./system.service";

/** PRD §11.8/§16.7 System Health read API. */
@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get("health")
  health() {
    return this.systemService.health();
  }

  @Get("jobs")
  jobs(@Query("limit") limit?: string) {
    return this.systemService.jobs(limit);
  }

  @Get("quota")
  quota() {
    return this.systemService.quota();
  }

  @Get("api-usage")
  apiUsage() {
    return this.systemService.apiUsage();
  }
}
