export const WATCH_PAGE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export class WatchPageFetchError extends Error {
  constructor(public readonly status: number) {
    super(`watch page fetch failed with status ${status}`);
  }
}

export async function fetchWatchPageHtml(
  youtubeVideoId: string,
  gl: string,
  hl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `https://www.youtube.com/watch?v=${youtubeVideoId}&gl=${gl}&hl=${hl}`;
  const response = await fetchImpl(url, { headers: { "User-Agent": WATCH_PAGE_USER_AGENT } });
  if (!response.ok) {
    throw new WatchPageFetchError(response.status);
  }
  return response.text();
}
