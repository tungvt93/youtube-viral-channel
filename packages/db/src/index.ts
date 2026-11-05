export function packageMarker(): string {
  return "@yvi/db";
}

export { prisma } from "./client";
export type { PrismaClient } from "./client";

export { getMarketById, listEnabledMarkets } from "./repositories/markets";

export {
  getDiscoveryQueryById,
  listEnabledDiscoveryQueriesWithMarket,
  touchDiscoveryQueryLastRunAt,
} from "./repositories/discovery-queries";
export type { DiscoveryQueryWithMarket } from "./repositories/discovery-queries";

export {
  getVideoById,
  getVideoByYoutubeId,
  listVideosDueForSnapshot,
  updateVideoMonitoringState,
  upsertVideo,
} from "./repositories/videos";
export type { DueSnapshotVideo, UpdateVideoMonitoringStateInput, VideoUpsertInput } from "./repositories/videos";

export { insertVideoSnapshot, listVideoSnapshots } from "./repositories/video-snapshots";
export type { InsertVideoSnapshotInput } from "./repositories/video-snapshots";

export { ensureChannelStub, getChannelByYoutubeId, upsertChannel } from "./repositories/channels";
export type { ChannelUpsertInput } from "./repositories/channels";

export { createDiscoveryEvent } from "./repositories/discovery-events";
export type { CreateDiscoveryEventInput } from "./repositories/discovery-events";

export { finishJobRun, getJobRunById, startJobRun } from "./repositories/job-runs";
export type { FinishJobRunInput, StartJobRunInput } from "./repositories/job-runs";

export { recordApiUsage, sumTodayQuotaUsage } from "./repositories/api-usage";
export type { RecordApiUsageInput } from "./repositories/api-usage";

export { getDailyBudget } from "./repositories/app-settings";
