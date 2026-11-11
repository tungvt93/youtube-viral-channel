import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";
import { markAlertRead } from "./actions";

vi.mock("../../../lib/api", () => ({
  fetchApi: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("markAlertRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCHes the alert's read route and revalidates the alerts page", async () => {
    vi.mocked(fetchApi).mockResolvedValue(undefined);

    await markAlertRead("alert-1");

    expect(fetchApi).toHaveBeenCalledWith("/alerts/alert-1/read", { method: "PATCH" });
    expect(revalidatePath).toHaveBeenCalledWith("/alerts");
  });
});
