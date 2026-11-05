import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { loggerConfig } from "./common/logger.config";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [LoggerModule.forRoot(loggerConfig), HealthModule],
})
export class AppModule {}
