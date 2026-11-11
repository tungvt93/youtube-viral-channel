"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, fetchApi } from "../../../lib/api";

/** `POST /discovery/queries` (PRD FR-DIS-01) — numeric fields are required by apps/api's `CreateDiscoveryQueryBody` validation, so empty inputs are left as `NaN` and rejected server-side rather than silently defaulted here. */
export async function createDiscoveryQuery(formData: FormData): Promise<void> {
  const body = {
    marketId: String(formData.get("marketId") ?? ""),
    topicId: formData.get("topicId") ? String(formData.get("topicId")) : null,
    query: String(formData.get("query") ?? ""),
    language: String(formData.get("language") ?? ""),
    strategy: String(formData.get("strategy") ?? ""),
    priority: Number(formData.get("priority")),
    maxPagesPerRun: Number(formData.get("maxPagesPerRun")),
    frequencyMinutes: Number(formData.get("frequencyMinutes")),
  };
  await fetchApi("/discovery/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  revalidatePath("/discovery");
}

/** `PATCH /discovery/queries/:id` — only the `enabled` toggle (PRD §16.6); the list page binds the next value in as `!query.enabled`. */
export async function updateDiscoveryQueryEnabled(id: string, enabled: boolean): Promise<void> {
  await fetchApi(`/discovery/queries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  revalidatePath("/discovery");
}

/** `POST /discovery/queries/:id/run` (PRD FR-DIS-10) — rate-limited at 10/60s by apps/api; a 429 redirects back with a query flag instead of throwing, since this is a manual admin action with no other error surface on this page. */
export async function triggerDiscoveryRun(id: string): Promise<void> {
  try {
    await fetchApi(`/discovery/queries/${id}/run`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      redirect("/discovery?error=rate_limited");
    }
    throw error;
  }
  revalidatePath("/discovery");
}
