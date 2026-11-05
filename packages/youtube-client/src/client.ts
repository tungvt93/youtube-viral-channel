import { CircuitBreaker } from "./circuit-breaker";
import { parseIso8601DurationToSeconds } from "./duration";
import { QUOTA_COST, requestJson } from "./http";
import type {
  ChannelResourceItem,
  ChannelsListResult,
  MostPopularParams,
  SearchListParams,
  SearchListResult,
  SearchResultItem,
  VideoResourceItem,
  VideosListResult,
} from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_BATCH_IDS = 50;

export interface YouTubeClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
  now?: () => number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function parseEmbedDimensions(embedHtml: string | undefined): { width: number | null; height: number | null } {
  if (!embedHtml) {
    return { width: null, height: null };
  }
  const width = /width="(\d+)"/.exec(embedHtml)?.[1];
  const height = /height="(\d+)"/.exec(embedHtml)?.[1];
  return {
    width: width ? Number(width) : null,
    height: height ? Number(height) : null,
  };
}

interface RawSearchResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { title?: string; description?: string; channelId?: string; publishedAt?: string };
  }>;
  nextPageToken?: string;
}

interface RawVideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      publishedAt?: string;
      categoryId?: string;
      defaultLanguage?: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
      liveBroadcastContent?: string;
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    status?: { license?: string; privacyStatus?: string; embeddable?: boolean };
    player?: { embedHtml?: string };
  }>;
  nextPageToken?: string;
}

interface RawChannelsResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      country?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string } };
    };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
      hiddenSubscriberCount?: boolean;
    };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

function mapVideoItem(item: NonNullable<RawVideosResponse["items"]>[number]): VideoResourceItem {
  const embed = parseEmbedDimensions(item.player?.embedHtml);
  return {
    videoId: item.id ?? "",
    channelId: item.snippet?.channelId ?? "",
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    categoryId: item.snippet?.categoryId ?? "",
    defaultLanguage: item.snippet?.defaultLanguage,
    durationSeconds: item.contentDetails?.duration
      ? parseIso8601DurationToSeconds(item.contentDetails.duration)
      : null,
    viewCount: item.statistics?.viewCount !== undefined ? Number(item.statistics.viewCount) : undefined,
    likeCount: item.statistics?.likeCount !== undefined ? Number(item.statistics.likeCount) : undefined,
    commentCount: item.statistics?.commentCount !== undefined ? Number(item.statistics.commentCount) : undefined,
    videoLicense: item.status?.license,
    privacyStatus: item.status?.privacyStatus,
    embeddable: item.status?.embeddable,
    liveBroadcastContent: item.snippet?.liveBroadcastContent,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
    embedWidth: embed.width,
    embedHeight: embed.height,
  };
}

function mapChannelItem(item: NonNullable<RawChannelsResponse["items"]>[number]): ChannelResourceItem {
  return {
    channelId: item.id ?? "",
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    customUrl: item.snippet?.customUrl,
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url,
    country: item.snippet?.country,
    publishedAt: item.snippet?.publishedAt,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
    subscriberCount:
      item.statistics?.subscriberCount !== undefined ? Number(item.statistics.subscriberCount) : undefined,
    viewCount: item.statistics?.viewCount !== undefined ? Number(item.statistics.viewCount) : undefined,
    videoCount: item.statistics?.videoCount !== undefined ? Number(item.statistics.videoCount) : undefined,
    subscriberCountHidden: item.statistics?.hiddenSubscriberCount,
  };
}

/**
 * Typed adapter over the YouTube Data API v3 REST endpoints used by
 * discovery/enrichment (PRD §6). Uses Node 20's built-in fetch; no SDK.
 * The API key is only ever read from the constructor argument, placed in
 * the request query string, and never logged.
 */
export class YouTubeClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep?: (ms: number) => Promise<void>;
  private readonly breaker: CircuitBreaker;

  constructor(options: YouTubeClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep;
    this.breaker = new CircuitBreaker({
      failureThreshold: options.circuitBreakerFailureThreshold ?? 5,
      cooldownMs: options.circuitBreakerCooldownMs ?? 30_000,
      now: options.now,
    });
  }

  private buildUrl(path: string, params: Record<string, string | number | undefined>): URL {
    const url = new URL(`${API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set("key", this.apiKey);
    return url;
  }

  private request<T>(url: URL): Promise<T> {
    return requestJson<T>(url, {
      fetchImpl: this.fetchImpl,
      breaker: this.breaker,
      maxRetries: this.maxRetries,
      sleep: this.sleep,
    });
  }

  async search(params: SearchListParams): Promise<SearchListResult> {
    const url = this.buildUrl("search", {
      part: "snippet",
      type: "video",
      q: params.q,
      regionCode: params.regionCode,
      relevanceLanguage: params.relevanceLanguage,
      publishedAfter: params.publishedAfter,
      order: params.order,
      videoDuration: params.videoDuration,
      maxResults: params.maxResults ?? 50,
      pageToken: params.pageToken,
    });
    const raw = await this.request<RawSearchResponse>(url);
    const items: SearchResultItem[] = (raw.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id!.videoId!,
        channelId: item.snippet?.channelId ?? "",
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        publishedAt: item.snippet?.publishedAt ?? "",
      }));
    return { items, nextPageToken: raw.nextPageToken };
  }

  async listMostPopularVideos(params: MostPopularParams): Promise<VideosListResult> {
    const url = this.buildUrl("videos", {
      part: params.maxHeight ? "snippet,statistics,contentDetails,status,player" : "snippet,statistics,contentDetails,status",
      chart: "mostPopular",
      regionCode: params.regionCode,
      videoCategoryId: params.videoCategoryId,
      maxResults: params.maxResults ?? 50,
      pageToken: params.pageToken,
      maxHeight: params.maxHeight,
    });
    const raw = await this.request<RawVideosResponse>(url);
    return {
      items: (raw.items ?? []).map(mapVideoItem),
      nextPageToken: raw.nextPageToken,
      callsMade: 1,
    };
  }

  async listVideosByIds(ids: string[], options: { includePlayer?: boolean; maxHeight?: number } = {}): Promise<VideosListResult> {
    if (ids.length === 0) {
      return { items: [], callsMade: 0 };
    }
    const part = options.includePlayer
      ? "snippet,statistics,contentDetails,status,player"
      : "snippet,statistics,contentDetails,status";
    const batches = chunk(ids, MAX_BATCH_IDS);
    const items: VideoResourceItem[] = [];
    for (const batch of batches) {
      const url = this.buildUrl("videos", {
        part,
        id: batch.join(","),
        maxHeight: options.includePlayer ? options.maxHeight ?? 200 : undefined,
      });
      const raw = await this.request<RawVideosResponse>(url);
      items.push(...(raw.items ?? []).map(mapVideoItem));
    }
    return { items, callsMade: batches.length };
  }

  async listChannelsByIds(ids: string[]): Promise<ChannelsListResult> {
    if (ids.length === 0) {
      return { items: [], callsMade: 0 };
    }
    const batches = chunk(ids, MAX_BATCH_IDS);
    const items: ChannelResourceItem[] = [];
    for (const batch of batches) {
      const url = this.buildUrl("channels", {
        part: "snippet,statistics,contentDetails",
        id: batch.join(","),
      });
      const raw = await this.request<RawChannelsResponse>(url);
      items.push(...(raw.items ?? []).map(mapChannelItem));
    }
    return { items, callsMade: batches.length };
  }
}

export { QUOTA_COST };
