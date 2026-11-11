"use server";

import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";

/** `PATCH /alerts/:id/read` (PRD §16.7). */
export async function markAlertRead(id: string): Promise<void> {
  await fetchApi(`/alerts/${id}/read`, { method: "PATCH" });
  revalidatePath("/alerts");
}
