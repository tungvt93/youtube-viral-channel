import { describe, it, expect, vi } from "vitest";
import { fetchWatchPageHtml, WATCH_PAGE_USER_AGENT, WatchPageFetchError } from "./fetch-watch-page";

describe("fetchWatchPageHtml", () => {
  it("requests the watch page with gl/hl and a desktop User-Agent", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("<html></html>") });

    await fetchWatchPageHtml("vid123", "US", "en", fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://www.youtube.com/watch?v=vid123&gl=US&hl=en");
    expect(init.headers["User-Agent"]).toBe(WATCH_PAGE_USER_AGENT);
  });

  it("throws WatchPageFetchError on a non-200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve("") });

    await expect(
      fetchWatchPageHtml("vid123", "US", "en", fetchImpl as unknown as typeof fetch)
    ).rejects.toMatchObject({ status: 429 });
  });
});
