import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../lib/api";
import { Sidebar } from "./sidebar";

vi.mock("../lib/api", () => ({
  fetchApi: vi.fn(),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Search nav link pointing at /search", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const html = renderToStaticMarkup(await Sidebar());

    expect(html).toContain(">Search<");
    expect(html).toMatch(/href="\/search"[^>]*>[^<]*Search/);
  });

  it("does not render a Discovery Sources link", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const html = renderToStaticMarkup(await Sidebar());

    expect(html).not.toContain("Discovery Sources");
    expect(html).not.toContain("/discovery");
  });

  it("shows no badge when fetchApi returns an empty unseen list", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const html = renderToStaticMarkup(await Sidebar());

    expect(html).not.toContain('data-testid="unseen-search-badge"');
  });

  it("shows the unseen count as a badge when fetchApi returns unseen completed searches", async () => {
    vi.mocked(fetchApi).mockResolvedValue([{ id: "ks-1" }, { id: "ks-2" }]);

    const html = renderToStaticMarkup(await Sidebar());

    expect(html).toMatch(/data-testid="unseen-search-badge"[^>]*>2</);
  });
});
