import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { ActiveSessionWithUser } from "@yvi/db";
import { CurrentUser } from "../auth/current-user.decorator";
import { RateLimit } from "../common/rate-limit.decorator";
import { type VideoFilterQuery, VideosService } from "./videos.service";

type RequestUser = ActiveSessionWithUser["user"];

/** The subset of Express's `Response` this controller needs — avoids an explicit `express` type dependency (it is only a transitive dep of `@nestjs/platform-express`). */
interface CsvResponse {
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

/** PRD §16.3 Viral Videos read API (list/detail), plus the §25 Phase 2 "snapshot/score history" sub-resources used by the detail page's charts. */
@Controller("videos")
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  list(
    @Query("marketId") marketId?: string,
    @Query("format") format?: string,
    @Query("lifecycle") lifecycle?: string,
    @Query("topicId") topicId?: string,
    @Query("discoveryQueryId") discoveryQueryId?: string,
    @Query("keywordSearchId") keywordSearchId?: string,
    @Query("channelTier") channelTier?: string,
    @Query("minViews") minViews?: string,
    @Query("minScore") minScore?: string,
    @Query("watchlistedOnly") watchlistedOnly?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.videosService.list(
      { marketId, format, lifecycle, topicId, discoveryQueryId, keywordSearchId, channelTier, minViews, minScore, watchlistedOnly },
      limit,
      offset,
      user?.id,
    );
  }

  @Get(":id")
  detail(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    return this.videosService.detail(id, user?.id);
  }

  @Get(":id/snapshots")
  snapshots(@Param("id") id: string) {
    return this.videosService.getSnapshots(id);
  }

  @Get(":id/scores")
  scores(@Param("id") id: string) {
    return this.videosService.getScores(id);
  }

  @Post(":id/watchlist")
  @HttpCode(204)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  star(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.videosService.star(id, user.id);
  }

  @Delete(":id/watchlist")
  @HttpCode(204)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  unstar(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.videosService.unstar(id, user.id);
  }

  /** `POST /videos/export` (PRD §16.3, §16.8, FR-VID-10) — same filters as `GET /videos`, row-capped and rate-limited (plan Scope/Risks). */
  @Post("export")
  @RateLimit({ limit: 5, windowMs: 60_000 })
  async export(@Body() body: VideoFilterQuery, @Res() res: CsvResponse, @CurrentUser() user?: RequestUser) {
    const { csv, truncated } = await this.videosService.exportCsv(body, user?.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="videos-export.csv"');
    res.setHeader("X-Export-Truncated", truncated ? "true" : "false");
    res.send(csv);
  }
}
