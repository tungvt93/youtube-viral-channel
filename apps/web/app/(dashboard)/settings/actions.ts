"use server";

import { revalidatePath } from "next/cache";
import { fetchApi } from "../../../lib/api";

/** `PATCH /markets/:id` — only the `enabled` toggle (PRD §16.2, FR-MKT-02); no market-health UI in this phase's Scope (see plan Decisions), so this is the only market mutation on the Settings page. */
export async function updateMarketEnabled(id: string, enabled: boolean): Promise<void> {
  await fetchApi(`/markets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  revalidatePath("/settings");
}
