import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { loggerConfig } from "./common/logger.config";
import { AlertsModule } from "./alerts/alerts.module";
import { HealthModule } from "./health/health.module";
import { KeywordSearchesModule } from "./keyword-searches/keyword-searches.module";
import { VideosModule } from "./videos/videos.module";
import { ChannelsModule } from "./channels/channels.module";
import { TopicsModule } from "./topics/topics.module";
import { AuthModule } from "./auth/auth.module";
import { SessionAuthGuard } from "./auth/session-auth.guard";
import { AuditLogInterceptor } from "./common/audit-log.interceptor";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { RateLimitGuard } from "./common/rate-limit.guard";
import { OverviewModule } from "./overview/overview.module";
import { MarketsModule } from "./markets/markets.module";
import { SystemModule } from "./system/system.module";

@Module({
  imports: [
    LoggerModule.forRoot(loggerConfig),
    HealthModule,
    KeywordSearchesModule,
    VideosModule,
    ChannelsModule,
    TopicsModule,
    AuthModule,
    OverviewModule,
    MarketsModule,
    SystemModule,
    AlertsModule,
  ],
  providers: [
    // SessionAuthGuard must run before RateLimitGuard so an unauthenticated
    // request is rejected before any rate-limit bookkeeping runs (plan Risks,
    // 2026-11-06) — NestJS evaluates global APP_GUARDs in providers-array order.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
