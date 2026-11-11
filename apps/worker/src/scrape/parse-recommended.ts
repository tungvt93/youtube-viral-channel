export interface RecommendedVideo {
  youtubeVideoId: string;
  sidebarRank: number;
}

export function parseRecommendedVideos(html: string): RecommendedVideo[] {
  // Try to extract ytInitialData from the HTML
  let jsonStr: string | null = null;

  // Try the standard pattern first
  const match1 = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (match1) {
    jsonStr = match1[1];
  } else {
    // Try alternative pattern with window["ytInitialData"] = ...
    const match2 = html.match(/window\["ytInitialData"\] = (\{.*?\});<\/script>/s);
    if (match2) {
      jsonStr = match2[1];
    }
  }

  if (!jsonStr) {
    return [];
  }

  // Parse JSON safely
  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  // Walk the nested structure
  const results = (data as Record<string, any>)?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results;

  if (!Array.isArray(results)) {
    return [];
  }

  // Filter to entries with compactVideoRenderer.videoId and map with rank
  const recommended: RecommendedVideo[] = [];
  for (const item of results) {
    const videoId = (item as Record<string, any>)?.compactVideoRenderer?.videoId;
    if (videoId) {
      recommended.push({
        youtubeVideoId: videoId,
        sidebarRank: recommended.length,
      });
    }
  }

  return recommended;
}
