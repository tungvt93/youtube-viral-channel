export interface RecommendedVideo {
  youtubeVideoId: string;
  sidebarRank: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
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

  // Walk the nested structure down to the secondaryResults array
  const results = asRecord(asRecord(asRecord(asRecord(asRecord(data)?.contents)?.twoColumnWatchNextResults)?.secondaryResults)?.secondaryResults)
    ?.results;

  if (!Array.isArray(results)) {
    return [];
  }

  // Each `results` entry is an itemSectionRenderer wrapping the actual sidebar items.
  const sectionItems: unknown[] = [];
  for (const entry of results) {
    const contents = asRecord(asRecord(entry)?.itemSectionRenderer)?.contents;
    if (Array.isArray(contents)) {
      sectionItems.push(...contents);
    }
  }

  // Filter to lockupViewModel entries that are videos, and map with rank
  const recommended: RecommendedVideo[] = [];
  for (const item of sectionItems) {
    const lockup = asRecord(asRecord(item)?.lockupViewModel);
    if (!lockup) {
      continue;
    }
    const contentId = lockup.contentId;
    if (lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && typeof contentId === "string" && contentId.length > 0) {
      recommended.push({
        youtubeVideoId: contentId,
        sidebarRank: recommended.length,
      });
    }
  }

  return recommended;
}
