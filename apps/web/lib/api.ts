import { redirect } from "next/navigation";
import { getSessionToken } from "./session";

/**
 * Server-only base URL for apps/api, reachable only from this server process
 * — never `NEXT_PUBLIC_*`, so it's never bundled into client JS (plan
 * Approach step 1: the BFF proxy is what replaces a CSRF-token mechanism).
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Low-level server-to-server call to apps/api with no session handling — used only by the BFF auth route handlers (`app/api/auth/*`), which own the cookie themselves. */
export async function callApi<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${API_INTERNAL_URL}${path}`, { ...init, cache: "no-store" });
  const body = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
  return { status: res.status, body };
}

/**
 * Server Component data loader, also used by Server Actions (phase 6b) to
 * mutate state with `init.method`/`init.body` — forwards the first-party
 * session cookie as `X-Session-Token` and redirects to /login on a missing
 * or rejected session. Never returns fabricated/empty data for an auth
 * failure (PRD §13.7: missing data must never render as `0` or an empty
 * state).
 */
export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  if (!token) {
    redirect("/login");
  }

  const res = await fetch(`${API_INTERNAL_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), "X-Session-Token": token },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    redirect("/login");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `${path} failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/**
 * Raw server-to-server call to apps/api with no session handling and no
 * response parsing — like `callApi`, used only by a BFF route handler that
 * owns auth itself, but here because the response body/headers (CSV text,
 * `Content-Disposition`, `X-Export-Truncated`) must reach the browser
 * unparsed. Currently only `app/api/videos/export/route.ts` uses this.
 */
export async function callApiRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_INTERNAL_URL}${path}`, { ...init, cache: "no-store" });
}
