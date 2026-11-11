import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";

@Module({
  imports: [ChannelsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
