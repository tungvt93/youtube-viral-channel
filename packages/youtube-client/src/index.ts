export function packageMarker(): string {
  return "@yvi/youtube-client";
}

export { YouTubeClient } from "./client";
export type { YouTubeClientOptions } from "./client";
export { QUOTA_COST } from "./http";
export { YouTubeApiError } from "./errors";
export type { YouTubeErrorCode } from "./errors";
export { parseIso8601DurationToSeconds } from "./duration";
export { classifyFormat } from "./shorts-detection";
export type { FormatClassification, ShortsDetectionInput, ShortsDetectionResult } from "./shorts-detection";
export type {
  SearchListParams,
  SearchListResult,
  SearchResultItem,
  MostPopularParams,
  VideoResourceItem,
  VideosListResult,
  ChannelResourceItem,
  ChannelsListResult,
} from "./types";
