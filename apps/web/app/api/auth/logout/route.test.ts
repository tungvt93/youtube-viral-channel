import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { callApi } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { POST } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("../../../../lib/api", () => ({
  callApi: vi.fn(),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op toward apps/api when no session cookie is present, but still clears the cookie", async () => {
    vi.mocked(cookies).mockReturnValue({ get: vi.fn().mockReturnValue(undefined) } as never);

    const response = await POST();

    expect(callApi).not.toHaveBeenCalled();
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("calls apps/api logout with the session token and clears the cookie", async () => {
    vi.mocked(cookies).mockReturnValue({ get: vi.fn().mockReturnValue({ value: "token-abc" }) } as never);
    vi.mocked(callApi).mockResolvedValue({ status: 204, body: null });

    const response = await POST();

    expect(callApi).toHaveBeenCalledWith("/auth/logout", { method: "POST", headers: { "X-Session-Token": "token-abc" } });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("still clears the cookie even if apps/api's logout call fails", async () => {
    vi.mocked(cookies).mockReturnValue({ get: vi.fn().mockReturnValue({ value: "token-abc" }) } as never);
    vi.mocked(callApi).mockRejectedValue(new Error("network error"));

    const response = await POST();

    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });
});
