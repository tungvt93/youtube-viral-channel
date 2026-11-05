import { describe, expect, it, vi } from "vitest";
import { YouTubeClient } from "./client";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("YouTubeClient", () => {
  describe("search", () => {
    it("builds the search.list request and maps items", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: { videoId: "v1" },
              snippet: { title: "t1", description: "d1", channelId: "c1", publishedAt: "2026-01-01T00:00:00Z" },
            },
          ],
          nextPageToken: "page2",
        }),
      );
      const client = new YouTubeClient({ apiKey: "secret-key", fetchImpl });
      const result = await client.search({ q: "funny pets", regionCode: "US", videoDuration: "short" });

      expect(result).toEqual({
        items: [{ videoId: "v1", channelId: "c1", title: "t1", description: "d1", publishedAt: "2026-01-01T00:00:00Z" }],
        nextPageToken: "page2",
      });

      const calledUrl = fetchImpl.mock.calls[0][0] as URL;
      expect(calledUrl.pathname).toBe("/youtube/v3/search");
      expect(calledUrl.searchParams.get("q")).toBe("funny pets");
      expect(calledUrl.searchParams.get("videoDuration")).toBe("short");
      expect(calledUrl.searchParams.get("key")).toBe("secret-key");
      expect(calledUrl.searchParams.get("type")).toBe("video");
    });

    it("skips search result items with no videoId", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{ snippet: { title: "no id" } }] }));
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.search({ q: "x" });
      expect(result.items).toEqual([]);
    });
  });

  describe("listMostPopularVideos", () => {
    it("calls videos.list with chart=mostPopular and maps full metadata", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: "v1",
              snippet: { title: "t", description: "d", channelId: "c1", publishedAt: "2026-01-01T00:00:00Z", categoryId: "26" },
              contentDetails: { duration: "PT1M30S" },
              statistics: { viewCount: "100", likeCount: "10", commentCount: "2" },
              status: { privacyStatus: "public", embeddable: true },
            },
          ],
        }),
      );
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listMostPopularVideos({ regionCode: "US" });

      expect(result.callsMade).toBe(1);
      expect(result.items[0]).toMatchObject({
        videoId: "v1",
        channelId: "c1",
        categoryId: "26",
        durationSeconds: 90,
        viewCount: 100,
      });

      const calledUrl = fetchImpl.mock.calls[0][0] as URL;
      expect(calledUrl.searchParams.get("chart")).toBe("mostPopular");
      expect(calledUrl.searchParams.get("regionCode")).toBe("US");
    });

    it("includes the player part and maxHeight when requested, parsing embed dimensions", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: "v1",
              snippet: { title: "t", description: "d", channelId: "c1", publishedAt: "p", categoryId: "26" },
              player: { embedHtml: '<iframe width="112" height="200" src="x"></iframe>' },
            },
          ],
        }),
      );
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listMostPopularVideos({ regionCode: "US", maxHeight: 200 });

      expect(result.items[0].embedWidth).toBe(112);
      expect(result.items[0].embedHeight).toBe(200);
      const calledUrl = fetchImpl.mock.calls[0][0] as URL;
      expect(calledUrl.searchParams.get("part")).toContain("player");
      expect(calledUrl.searchParams.get("maxHeight")).toBe("200");
    });
  });

  describe("listVideosByIds", () => {
    it("returns no calls for an empty id list", async () => {
      const fetchImpl = vi.fn();
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listVideosByIds([]);
      expect(result).toEqual({ items: [], callsMade: 0 });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("batches more than 50 ids into multiple ≤50-id calls", async () => {
      const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
      const fetchImpl = vi.fn().mockImplementation(async (url: URL) => {
        const batchIds = url.searchParams.get("id")!.split(",");
        return jsonResponse({
          items: batchIds.map((id) => ({
            id,
            snippet: { title: id, description: "", channelId: "c", publishedAt: "p", categoryId: "26" },
          })),
        });
      });
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listVideosByIds(ids);

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(result.callsMade).toBe(3);
      expect(result.items).toHaveLength(120);
      for (const call of fetchImpl.mock.calls) {
        const url = call[0] as URL;
        expect(url.searchParams.get("id")!.split(",").length).toBeLessThanOrEqual(50);
      }
    });
  });

  describe("listPlaylistItems", () => {
    it("builds the playlistItems.list request and maps items by position", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            { contentDetails: { videoId: "v1", videoPublishedAt: "2026-01-01T00:00:00Z" } },
            { contentDetails: { videoId: "v2", videoPublishedAt: "2026-01-02T00:00:00Z" } },
          ],
          nextPageToken: "page2",
        }),
      );
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listPlaylistItems("UUxyz", 10);

      expect(result).toEqual({
        items: [
          { videoId: "v1", publishedAt: "2026-01-01T00:00:00Z", position: 0 },
          { videoId: "v2", publishedAt: "2026-01-02T00:00:00Z", position: 1 },
        ],
        nextPageToken: "page2",
      });

      const calledUrl = fetchImpl.mock.calls[0][0] as URL;
      expect(calledUrl.pathname).toBe("/youtube/v3/playlistItems");
      expect(calledUrl.searchParams.get("playlistId")).toBe("UUxyz");
      expect(calledUrl.searchParams.get("maxResults")).toBe("10");
      expect(calledUrl.searchParams.get("part")).toBe("contentDetails");
    });

    it("defaults maxResults to 20 and skips items with no videoId", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{ contentDetails: {} }] }));
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listPlaylistItems("UUxyz");

      expect(result.items).toEqual([]);
      const calledUrl = fetchImpl.mock.calls[0][0] as URL;
      expect(calledUrl.searchParams.get("maxResults")).toBe("20");
    });
  });

  describe("listChannelsByIds", () => {
    it("maps channel resources including the uploads playlist id", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: "ch1",
              snippet: { title: "Channel", description: "d", country: "US" },
              statistics: { subscriberCount: "1000", viewCount: "5000", videoCount: "10" },
              contentDetails: { relatedPlaylists: { uploads: "UUxyz" } },
            },
          ],
        }),
      );
      const client = new YouTubeClient({ apiKey: "k", fetchImpl });
      const result = await client.listChannelsByIds(["ch1"]);

      expect(result.callsMade).toBe(1);
      expect(result.items[0]).toMatchObject({
        channelId: "ch1",
        title: "Channel",
        subscriberCount: 1000,
        uploadsPlaylistId: "UUxyz",
      });
    });
  });
});
