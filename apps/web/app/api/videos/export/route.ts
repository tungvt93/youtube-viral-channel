import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callApiRaw } from "../../../../lib/api";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";

/** Mirrors the videos list page's `FILTER_KEYS` — kept in sync manually since this route only ever reads the hidden inputs that page's export `<form>` submits. */
const FILTER_KEYS = ["marketId", "format", "lifecycle", "topicId", "channelTier", "minViews", "minScore", "watchlistedOnly"] as const;

/**
 * BFF CSV export proxy — the one deliberate exception to "no new route
 * handlers" (plan Approach step 3): a Server Action can't produce a
 * navigable file-download response with custom headers, so the videos page
 * posts a plain `<form>` (no client JS) here instead. Converts the form's
 * hidden filter inputs to a JSON body for apps/api, then streams the CSV
 * body/headers back unparsed via `callApiRaw`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const formData = await request.formData();
  const body: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") {
      body[key] = value;
    }
  }

  const apiResponse = await callApiRaw("/videos/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Token": token },
    body: JSON.stringify(body),
  });

  if (apiResponse.status === 401 || apiResponse.status === 403) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!apiResponse.ok) {
    return NextResponse.json({ error: "Export failed" }, { status: apiResponse.status });
  }

  const csv = await apiResponse.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": apiResponse.headers.get("Content-Type") ?? "text/csv; charset=utf-8",
      "Content-Disposition": apiResponse.headers.get("Content-Disposition") ?? 'attachment; filename="videos-export.csv"',
      "X-Export-Truncated": apiResponse.headers.get("X-Export-Truncated") ?? "false",
    },
  });
}
