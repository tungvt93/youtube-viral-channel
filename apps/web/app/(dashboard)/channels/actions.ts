"use server";

import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";

/** `POST /channels/:id/watchlist` (PRD FR-CH-06) — revalidated with `"layout"` so every `/channels/[id]` detail page under it picks up the new `isWatchlisted` value too, not just the list. */
export async function starChannel(id: string): Promise<void> {
  await fetchApi(`/channels/${id}/watchlist`, { method: "POST" });
  revalidatePath("/channels", "layout");
  revalidatePath("/watchlist");
}

/** `DELETE /channels/:id/watchlist`. */
export async function unstarChannel(id: string): Promise<void> {
  await fetchApi(`/channels/${id}/watchlist`, { method: "DELETE" });
  revalidatePath("/channels", "layout");
  revalidatePath("/watchlist");
}
