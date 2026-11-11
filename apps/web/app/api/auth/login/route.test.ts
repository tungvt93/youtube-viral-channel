import { beforeEach, describe, expect, it, vi } from "vitest";
import { callApi } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { POST } from "./route";

vi.mock("../../../../lib/api", () => ({
  callApi: vi.fn(),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a body missing email or password without calling apps/api", async () => {
    const response = await POST(jsonRequest({ email: "admin@example.com" }));

    expect(response.status).toBe(400);
    expect(callApi).not.toHaveBeenCalled();
  });

  it("returns 401 and sets no cookie when apps/api rejects the credentials", async () => {
    vi.mocked(callApi).mockResolvedValue({ status: 401, body: null });

    const response = await POST(jsonRequest({ email: "admin@example.com", password: "wrong" }));

    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("sets an httpOnly session cookie and returns the user on a successful login", async () => {
    vi.mocked(callApi).mockResolvedValue({
      status: 201,
      body: { sessionToken: "token-abc", expiresAt: "2026-11-13T00:00:00.000Z", user: { id: "u1", email: "admin@example.com", role: "admin" } },
    });

    const response = await POST(jsonRequest({ email: "admin@example.com", password: "correct" }));
    const json = await response.json();

    expect(json).toEqual({ user: { id: "u1", email: "admin@example.com", role: "admin" } });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("token-abc");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });
});
