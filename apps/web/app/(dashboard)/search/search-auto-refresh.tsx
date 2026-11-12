"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5_000;

/**
 * A keyword search takes ~1-2 minutes, and `/search` is otherwise a plain
 * Server Component — without this, a finished run only appears on a manual
 * reload. Polls `router.refresh()` while the server-rendered list still has
 * an unfinished row and stops as soon as it does not.
 */
export function SearchAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }
    const interval = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
