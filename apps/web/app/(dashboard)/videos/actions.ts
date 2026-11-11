"use server";

import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";

/** `POST /videos/:id/watchlist` (PRD FR-VID-08) — revalidated with `"layout"` so every `/videos/[id]` detail page under it picks up the new `isWatchlisted` value too, not just the list. */
export async function starVideo(id: string): Promise<void> {
  await fetchApi(`/videos/${id}/watchlist`, { method: "POST" });
  revalidatePath("/videos", "layout");
  revalidatePath("/watchlist");
}

/** `DELETE /videos/:id/watchlist`. */
export async function unstarVideo(id: string): Promise<void> {
  await fetchApi(`/videos/${id}/watchlist`, { method: "DELETE" });
  revalidatePath("/videos", "layout");
  revalidatePath("/watchlist");
}
