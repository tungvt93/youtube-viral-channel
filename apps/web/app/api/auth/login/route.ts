import { NextResponse } from "next/server";
import { callApi } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";

interface LoginRequestBody {
  email?: string;
  password?: string;
}

interface LoginResponseBody {
  sessionToken: string;
  expiresAt: string;
  user: { id: string; email: string; role: string };
}

/**
 * BFF login (plan Approach step 1): calls apps/api server-to-server, never
 * forwards apps/api's response body's `sessionToken` to the browser — it
 * only ever reaches the browser as this route's own httpOnly cookie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
  if (!body?.email || !body?.password) {
    return NextResponse.json({ message: "email and password are required" }, { status: 400 });
  }

  const { status, body: loginResult } = await callApi<LoginResponseBody>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  if (status !== 201 && status !== 200) {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
  }
  if (!loginResult) {
    return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ user: loginResult.user });
  response.cookies.set(SESSION_COOKIE_NAME, loginResult.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(loginResult.expiresAt),
  });
  return response;
}
