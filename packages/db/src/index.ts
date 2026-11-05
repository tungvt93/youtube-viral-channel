export function packageMarker(): string {
  return "@yvi/db";
}

export { prisma } from "./client";
export type { PrismaClient } from "./client";
export type { VideoSnapshot } from "../generated/client";

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
  listChannelPeerViews,
  listKnownYoutubeVideoIds,
  listVideosDueForSnapshot,
  listVideosEligibleForScoring,
  updateVideoMonitoringState,
  upsertVideo,
} from "./repositories/videos";
export type {
  ChannelPeerView,
  DueSnapshotVideo,
  ScoringEligibleVideo,
  UpdateVideoMonitoringStateInput,
  VideoUpsertInput,
} from "./repositories/videos";

export { insertVideoSnapshot, listRecentValidSnapshots, listVideoSnapshots } from "./repositories/video-snapshots";
export type { InsertVideoSnapshotInput } from "./repositories/video-snapshots";

export { insertVideoScore, listVideoScores } from "./repositories/video-scores";
export type { InsertVideoScoreInput } from "./repositories/video-scores";

export {
  ensureChannelStub,
  getChannelByYoutubeId,
  getChannelDetail,
  listChannels,
  listChannelsDueForVideoDiscovery,
  listChannelsEligibleForScoring,
  listChannelVideosForScoring,
  updateChannelLastVideoDiscoveryAt,
  updateChannelTier,
  upsertChannel,
} from "./repositories/channels";
export type {
  ChannelDetailRow,
  ChannelListFilter,
  ChannelListRow,
  ChannelUpsertInput,
  ChannelVideoForScoring,
  DueDiscoveryChannel,
  ScoringEligibleChannel,
} from "./repositories/channels";

export { getLatestChannelScore, insertChannelScore } from "./repositories/channel-scores";
export type { InsertChannelScoreInput } from "./repositories/channel-scores";

export { createDiscoveryEvent } from "./repositories/discovery-events";
export type { CreateDiscoveryEventInput } from "./repositories/discovery-events";

export { finishJobRun, getJobRunById, startJobRun } from "./repositories/job-runs";
export type { FinishJobRunInput, StartJobRunInput } from "./repositories/job-runs";

export { recordApiUsage, sumTodayQuotaUsage } from "./repositories/api-usage";
export type { RecordApiUsageInput } from "./repositories/api-usage";

export { getDailyBudget } from "./repositories/app-settings";
