"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, fetchApi } from "../../../lib/api";

/** Revalidated with `"layout"` (same reasoning as `starVideo`) so the sidebar's unseen badge, which lives in the `(dashboard)` layout segment, re-renders too. */
export async function createKeywordSearch(formData: FormData): Promise<void> {
  const body = {
    query: String(formData.get("query") ?? ""),
    marketId: String(formData.get("marketId") ?? ""),
    language: String(formData.get("language") ?? ""),
  };
  try {
    await fetchApi("/keyword-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      redirect("/search?error=rate_limited");
    }
    throw error;
  }
  revalidatePath("/search", "layout");
}

export async function ackKeywordSearch(id: string): Promise<void> {
  await fetchApi(`/keyword-searches/${id}/ack`, { method: "POST" });
  revalidatePath("/search", "layout");
}
