import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getSessionToken } from "./session";
import { ApiError, callApi, fetchApi } from "./api";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("./session", () => ({
  getSessionToken: vi.fn(),
}));

describe("fetchApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("redirects to /login without calling fetch when no session cookie is present", async () => {
    vi.mocked(getSessionToken).mockReturnValue(undefined);

    await expect(fetchApi("/overview/summary")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards the session token as X-Session-Token", async () => {
    vi.mocked(getSessionToken).mockReturnValue("token-abc");
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as never);

    const result = await fetchApi("/overview/summary");

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/overview/summary"), expect.objectContaining({ headers: { "X-Session-Token": "token-abc" } }));
    expect(result).toEqual({ ok: true });
  });

  it("redirects to /login on a 401 response", async () => {
    vi.mocked(getSessionToken).mockReturnValue("garbage-token");
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as never);

    await expect(fetchApi("/overview/summary")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login on a 403 response", async () => {
    vi.mocked(getSessionToken).mockReturnValue("token-abc");
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as never);

    await expect(fetchApi("/overview/summary")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("throws ApiError (not a silent empty result) on a non-auth error status", async () => {
    vi.mocked(getSessionToken).mockReturnValue("token-abc");
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as never);

    await expect(fetchApi("/overview/summary")).rejects.toThrow(ApiError);
  });
});

describe("callApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns the status and parsed body", async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 200, json: async () => ({ sessionToken: "abc" }) } as never);

    const result = await callApi("/auth/login", { method: "POST" });

    expect(result).toEqual({ status: 200, body: { sessionToken: "abc" } });
  });

  it("returns a null body for a 204 response without calling .json()", async () => {
    const json = vi.fn();
    vi.mocked(fetch).mockResolvedValue({ status: 204, json } as never);

    const result = await callApi("/auth/logout", { method: "POST" });

    expect(result).toEqual({ status: 204, body: null });
    expect(json).not.toHaveBeenCalled();
  });
});
