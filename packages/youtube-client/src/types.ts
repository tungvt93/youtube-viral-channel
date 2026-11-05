export interface SearchListParams {
  q: string;
  regionCode?: string;
  relevanceLanguage?: string;
  publishedAfter?: string;
  order?: "date" | "viewCount" | "relevance";
  videoDuration?: "short" | "medium" | "long" | "any";
  maxResults?: number;
  pageToken?: string;
}

export interface SearchResultItem {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
}

export interface SearchListResult {
  items: SearchResultItem[];
  nextPageToken?: string;
}

export interface MostPopularParams {
  regionCode: string;
  videoCategoryId?: string;
  maxResults?: number;
  pageToken?: string;
  /** Requests the `player` part at this height to support the Shorts heuristic; no extra quota cost. */
  maxHeight?: number;
}

export interface VideoResourceItem {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  categoryId: string;
  defaultLanguage?: string;
  durationSeconds: number | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  videoLicense?: string;
  privacyStatus?: string;
  embeddable?: boolean;
  liveBroadcastContent?: string;
  thumbnailUrl?: string;
  /** Parsed from the `player` part's embedHtml, when requested. */
  embedWidth?: number | null;
  embedHeight?: number | null;
}

export interface VideosListResult {
  items: VideoResourceItem[];
  nextPageToken?: string;
  /** Number of underlying HTTP calls made (1 per ≤50-id batch / page). */
  callsMade: number;
}

export interface ChannelResourceItem {
  channelId: string;
  title: string;
  description: string;
  customUrl?: string;
  thumbnailUrl?: string;
  country?: string;
  publishedAt?: string;
  uploadsPlaylistId?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  subscriberCountHidden?: boolean;
}

export interface ChannelsListResult {
  items: ChannelResourceItem[];
  callsMade: number;
}

export interface PlaylistItemResourceItem {
  videoId: string;
  publishedAt: string;
  position: number;
}

export interface PlaylistItemsListResult {
  items: PlaylistItemResourceItem[];
  nextPageToken?: string;
}
