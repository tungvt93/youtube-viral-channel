import { cookies } from "next/headers";

/** First-party session cookie set by `app/api/auth/login` (BFF route handler) — httpOnly, SameSite=Lax, this origin only. */
export const SESSION_COOKIE_NAME = "yvi_session";

export function getSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE_NAME)?.value;
}
