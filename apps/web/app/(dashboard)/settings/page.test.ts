import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchApi } from "../../../lib/api";
import SettingsPage from "./page";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the market list", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    await SettingsPage();

    expect(fetchApi).toHaveBeenCalledWith("/markets");
  });

  it("renders without throwing when no markets exist", async () => {
    vi.mocked(fetchApi).mockResolvedValue([]);

    const result = await SettingsPage();

    expect(result).toBeTruthy();
  });

  it("renders without throwing when markets are returned", async () => {
    vi.mocked(fetchApi).mockResolvedValue([
      { id: "market-1", code: "US", name: "United States", defaultLanguage: "en", timezone: "UTC", enabled: true },
    ]);

    const result = await SettingsPage();

    expect(result).toBeTruthy();
  });
});
