import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { loggerConfig } from "./common/logger.config";
import { HealthModule } from "./health/health.module";
import { DiscoveryModule } from "./discovery/discovery.module";
import { VideosModule } from "./videos/videos.module";

@Module({
  imports: [LoggerModule.forRoot(loggerConfig), HealthModule, DiscoveryModule, VideosModule],
})
export class AppModule {}
