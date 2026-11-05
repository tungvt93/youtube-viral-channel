import { Controller, Get, Param } from "@nestjs/common";
import { VideosService } from "./videos.service";

/** PRD §25 Phase 2 "snapshot APIs" roadmap task — read-only, scoped to what Phase 6's detail-page chart will need. */
@Controller("videos")
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(":id/snapshots")
  snapshots(@Param("id") id: string) {
    return this.videosService.getSnapshots(id);
  }
}
