import { describe, it, expect } from "vitest";
import { parseRecommendedVideos } from "./parse-recommended";

describe("parseRecommendedVideos", () => {
  it("extracts recommended video ids in sidebar order from a ytInitialData blob", () => {
    const html = `<html><script>var ytInitialData = ${JSON.stringify({
      contents: {
        twoColumnWatchNextResults: {
          secondaryResults: {
            secondaryResults: {
              results: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        lockupViewModel: {
                          contentId: "rec1",
                          contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
                          metadata: { lockupMetadataViewModel: { title: { content: "Rec 1" } } },
                        },
                      },
                      {
                        lockupViewModel: {
                          contentId: "rec2",
                          contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
                          metadata: { lockupMetadataViewModel: { title: { content: "Rec 2" } } },
                        },
                      },
                      {
                        lockupViewModel: {
                          contentId: "playlist1",
                          contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
                          metadata: { lockupMetadataViewModel: { title: { content: "A playlist" } } },
                        },
                      },
                      { continuationItemRenderer: { continuationEndpoint: {} } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    })};</script></html>`;

    expect(parseRecommendedVideos(html)).toEqual([
      { youtubeVideoId: "rec1", sidebarRank: 0 },
      { youtubeVideoId: "rec2", sidebarRank: 1 },
    ]);
  });

  it("returns an empty array when ytInitialData is absent (e.g. a consent-wall page)", () => {
    expect(parseRecommendedVideos("<html>consent required</html>")).toEqual([]);
  });

  it("returns an empty array when ytInitialData is present but malformed JSON", () => {
    expect(parseRecommendedVideos("<script>var ytInitialData = {not valid json;</script>")).toEqual([]);
  });
});
