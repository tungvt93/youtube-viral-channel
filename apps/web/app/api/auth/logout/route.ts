import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callApi } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";

/** BFF logout: clears this origin's cookie regardless of whether apps/api's session delete succeeds — logout must never leave a stale cookie behind. */
export async function POST(): Promise<NextResponse> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await callApi("/auth/logout", {
      method: "POST",
      headers: { "X-Session-Token": token },
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) });
  return response;
}
