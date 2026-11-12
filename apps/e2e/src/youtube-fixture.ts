import type { ChannelsListResult, SearchListResult, VideosListResult } from "@yvi/youtube-client";
import { YouTubeClient } from "@yvi/youtube-client";

/**
 * A unique, timestamp-derived marker baked into every id/title this fixture
 * produces, so cleanup can find (and assert it only ever deletes) rows this
 * suite itself created, never real dev data (plan Decisions, 2026-11-06).
 */
export function makeRunMarker(): string {
  return `e2e${Date.now()}`;
}

export interface FakeDiscoveredVideo {
  videoId: string;
  channelId: string;
  title: string;
}

/**
 * Fake `YouTubeClient` fixture (plan Approach step 5): a single deterministic
 * video/channel pair per run, keyed off `runMarker`, routed through the real
 * `createKeywordSearchProcessor` -> `createChannelEnrichmentProcessor`
 * chain — no real YouTube Data API call.
 */
export function createYoutubeFixture(runMarker: string): {
  client: YouTubeClient;
  video: FakeDiscoveredVideo;
} {
  const video: FakeDiscoveredVideo = {
    videoId: `vid-${runMarker}`,
    channelId: `chan-${runMarker}`,
    title: `E2E fixture video ${runMarker}`,
  };

  const fakeClient = {
    async search(): Promise<SearchListResult> {
      return {
        items: [
          {
            videoId: video.videoId,
            channelId: video.channelId,
            title: video.title,
            description: "Fixture video for the PRD 23.3 e2e flow.",
            publishedAt: new Date().toISOString(),
          },
        ],
        nextPageToken: undefined,
      };
    },

    async listVideosByIds(ids: string[]): Promise<VideosListResult> {
      const items = ids
        .filter((id) => id === video.videoId)
        .map((id) => ({
          videoId: id,
          channelId: video.channelId,
          title: video.title,
          description: "Fixture video for the PRD 23.3 e2e flow.",
          publishedAt: new Date().toISOString(),
          categoryId: "20",
          durationSeconds: 45,
          viewCount: 123_456,
          likeCount: 1_234,
          commentCount: 56,
          thumbnailUrl: "https://example.invalid/thumb.jpg",
          tags: ["fixture"],
        }));
      return { items, nextPageToken: undefined, callsMade: 1 };
    },

    async listChannelsByIds(ids: string[]): Promise<ChannelsListResult> {
      const items = ids
        .filter((id) => id === video.channelId)
        .map((id) => ({
          channelId: id,
          title: `E2E fixture channel ${runMarker}`,
          description: "Fixture channel for the PRD 23.3 e2e flow.",
          subscriberCount: 50_000,
          viewCount: 10_000_000,
          videoCount: 42,
          subscriberCountHidden: false,
        }));
      return { items, callsMade: 1 };
    },

    async listPlaylistItems() {
      return { items: [], nextPageToken: undefined };
    },

    async listMostPopularVideos() {
      return { items: [], nextPageToken: undefined, callsMade: 1 };
    },
  };

  return { client: fakeClient as unknown as YouTubeClient, video };
}
