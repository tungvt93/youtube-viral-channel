export function packageMarker(): string {
  return "@yvi/db";
}

export { prisma } from "./client";
export type { PrismaClient } from "./client";
export type { Alert, JobRun, Prisma, VideoSnapshot } from "../generated/client";

export { getMarketByCode, getMarketById, listAllMarkets, listEnabledMarkets, updateMarketEnabled } from "./repositories/markets";

export {
  createDiscoveryQuery,
  getDiscoveryQueryById,
  listDiscoveryQueriesWithMarket,
  listEnabledDiscoveryQueriesWithMarket,
  touchDiscoveryQueryLastRunAt,
  updateDiscoveryQuery,
} from "./repositories/discovery-queries";
export type {
  CreateDiscoveryQueryInput,
  DiscoveryQueryWithMarket,
  UpdateDiscoveryQueryInput,
} from "./repositories/discovery-queries";

export { addToWatchlist, isWatchlisted, removeFromWatchlist } from "./repositories/watchlist-items";
export type { WatchlistItemInput } from "./repositories/watchlist-items";

export { createAlertIfDue, getAlertById, listAlerts, markAlertRead } from "./repositories/alerts";
export type { AlertListFilter, CreateAlertInput } from "./repositories/alerts";

export { createAdminAuditLog } from "./repositories/admin-audit-logs";
export type { CreateAdminAuditLogInput } from "./repositories/admin-audit-logs";

export {
  countVideos,
  getVideoById,
  getVideoByYoutubeId,
  getVideoDetail,
  getVideoIdsByYoutubeIds,
  listChannelPeerViews,
  listKnownYoutubeVideoIds,
  listRecommendedScrapeSeeds,
  listVideos,
  listVideosDueForSnapshot,
  listVideosEligibleForClassification,
  listVideosEligibleForScoring,
  markVideoRecommendedScraped,
  updateVideoClassification,
  updateVideoMonitoringState,
  upsertVideo,
} from "./repositories/videos";
export type {
  ChannelPeerView,
  ClassificationEligibleVideo,
  DueSnapshotVideo,
  RecommendedScrapeSeed,
  ScoringEligibleVideo,
  UpdateVideoMonitoringStateInput,
  VideoDetailRow,
  VideoListFilter,
  VideoListRow,
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

export { finishJobRun, getJobRunById, listRecentJobRuns, startJobRun } from "./repositories/job-runs";
export type { FinishJobRunInput, StartJobRunInput } from "./repositories/job-runs";

export {
  ackKeywordSearch,
  createKeywordSearch,
  finishKeywordSearch,
  getKeywordSearchById,
  listKeywordSearchesWithMarket,
  markKeywordSearchRunning,
} from "./repositories/keyword-searches";
export type { FinishKeywordSearchInput, KeywordSearchWithMarket } from "./repositories/keyword-searches";
export type { KeywordSearch } from "../generated/client";

export {
  countFailedCallsToday,
  recordApiUsage,
  sumQuotaUsageByEndpoint,
  sumQuotaUsageByMarket,
  sumTodayQuotaUsage,
} from "./repositories/api-usage";
export type { QuotaUsageByEndpoint, QuotaUsageByMarket, RecordApiUsageInput } from "./repositories/api-usage";

export { getAiDailyBudget, getDailyBudget } from "./repositories/app-settings";

export { recordAiClassificationRun, sumTodayAiUsage } from "./repositories/ai-classification-runs";
export type { RecordAiClassificationRunInput } from "./repositories/ai-classification-runs";

export {
  applyTopicMerge,
  applyTopicPromotion,
  findTopicBySlug,
  getOrCreateCandidateTopic,
  getTopicById,
  listCandidateTopicsForNormalization,
  listTopics,
  slugifyTopicLabel,
  upsertVideoTopic,
} from "./repositories/topics";
export type {
  NormalizationCandidateRow,
  TopicListFilter,
  TopicListRow,
  UpsertVideoTopicInput,
} from "./repositories/topics";

export {
  getLatestTrendSnapshot,
  listObservedTopicVideos,
  listTrendSnapshotsForTopic,
  upsertTrendSnapshot,
} from "./repositories/trend-snapshots";
export type { ObservedTopicVideoRow, UpsertTrendSnapshotInput } from "./repositories/trend-snapshots";

export { findUserByEmail } from "./repositories/users";

export { createSession, deleteSession, getActiveSessionByToken } from "./repositories/sessions";
export type { ActiveSessionWithUser, CreateSessionInput } from "./repositories/sessions";

export {
  getOverviewCounts,
  listDiscoveryVolumeByDay,
  listEmergingVideosByMarket,
  listTopEmergingVideos,
  listTopRisingTopics,
} from "./repositories/overview";
export type {
  DiscoveryVolumePoint,
  EmergingByMarketRow,
  OverviewCounts,
  TopEmergingVideoRow,
  TopRisingTopicRow,
} from "./repositories/overview";
