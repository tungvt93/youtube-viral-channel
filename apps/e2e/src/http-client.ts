const SESSION_TOKEN_HEADER = "x-session-token";

export interface HttpClient {
  get(path: string): Promise<Response>;
  post(path: string, body?: unknown): Promise<Response>;
  patch(path: string, body?: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
  withSessionToken(sessionToken: string): HttpClient;
}

/**
 * Thin `fetch` wrapper over a spawned `apps/api` (per the plan's "plain
 * `fetch`, no supertest" constraint). `withSessionToken` returns a new
 * client carrying `x-session-token` on every request — the same header
 * `SessionAuthGuard` reads (`apps/api/src/auth/session-auth.guard.ts`).
 */
export function createHttpClient(baseUrl: string, sessionToken?: string): HttpClient {
  function headers(): Record<string, string> {
    const base: Record<string, string> = { "content-type": "application/json" };
    if (sessionToken) {
      base[SESSION_TOKEN_HEADER] = sessionToken;
    }
    return base;
  }

  return {
    get(path: string) {
      return fetch(`${baseUrl}${path}`, { headers: headers() });
    },
    post(path: string, body?: unknown) {
      return fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    },
    patch(path: string, body?: unknown) {
      return fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    },
    delete(path: string) {
      return fetch(`${baseUrl}${path}`, { method: "DELETE", headers: headers() });
    },
    withSessionToken(token: string) {
      return createHttpClient(baseUrl, token);
    },
  };
}
