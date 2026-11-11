import { beforeEach, describe, expect, it, vi } from "vitest";
import { callApiRaw } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { POST } from "./route";

vi.mock("../../../../lib/api", () => ({
  callApiRaw: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

function formRequest(fields: Record<string, string>): Request {
  const formData = new URLSearchParams(fields).toString();
  return new Request("http://localhost/api/videos/export", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });
}

async function mockCookie(value: string | undefined) {
  const { cookies } = await import("next/headers");
  vi.mocked(cookies).mockReturnValue({
    get: () => (value === undefined ? undefined : { name: SESSION_COOKIE_NAME, value }),
  } as never);
}

describe("POST /api/videos/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when there is no session cookie", async () => {
    await mockCookie(undefined);

    const response = await POST(formRequest({}));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(callApiRaw).not.toHaveBeenCalled();
  });

  it("forwards the form's filter fields to apps/api as a JSON body", async () => {
    await mockCookie("token-abc");
    vi.mocked(callApiRaw).mockResolvedValue(
      new Response("id,title\n1,Video 1", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="videos-export.csv"',
          "X-Export-Truncated": "false",
        },
      }),
    );

    const response = await POST(formRequest({ marketId: "market-1", watchlistedOnly: "true", format: "" }));

    expect(callApiRaw).toHaveBeenCalledWith("/videos/export", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Token": "token-abc" },
      body: JSON.stringify({ marketId: "market-1", watchlistedOnly: "true" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("id,title\n1,Video 1");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="videos-export.csv"');
    expect(response.headers.get("X-Export-Truncated")).toBe("false");
  });

  it("redirects to /login when apps/api rejects the session", async () => {
    await mockCookie("expired-token");
    vi.mocked(callApiRaw).mockResolvedValue(new Response(null, { status: 401 }));

    const response = await POST(formRequest({}));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("passes through a non-ok status (e.g. 429 rate limited) as JSON", async () => {
    await mockCookie("token-abc");
    vi.mocked(callApiRaw).mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(formRequest({}));

    expect(response.status).toBe(429);
  });
});
