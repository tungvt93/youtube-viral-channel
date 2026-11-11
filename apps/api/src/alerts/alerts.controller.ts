import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { RateLimit } from "../common/rate-limit.decorator";
import { AlertsService } from "./alerts.service";

/** PRD §11.7/§16.7 Alerts read/mark-read API. */
@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@Query("isRead") isRead?: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.alertsService.list({ isRead, limit, offset });
  }

  @Patch(":id/read")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  markRead(@Param("id") id: string) {
    return this.alertsService.markRead(id);
  }
}
