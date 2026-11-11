import { describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { getSessionToken, SESSION_COOKIE_NAME } from "./session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("getSessionToken", () => {
  it("returns the cookie's value when present", () => {
    vi.mocked(cookies).mockReturnValue({ get: vi.fn().mockReturnValue({ value: "token-abc" }) } as never);

    expect(getSessionToken()).toBe("token-abc");
  });

  it("returns undefined when the cookie is absent", () => {
    vi.mocked(cookies).mockReturnValue({ get: vi.fn().mockReturnValue(undefined) } as never);

    expect(getSessionToken()).toBeUndefined();
  });

  it("reads the documented session cookie name", () => {
    const get = vi.fn().mockReturnValue(undefined);
    vi.mocked(cookies).mockReturnValue({ get } as never);

    getSessionToken();

    expect(get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});
