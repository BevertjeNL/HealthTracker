"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Health ingest and scheduled Strava sync happen outside this browser session.
// Re-read the dynamic server pages while visible so their decisions catch up.
export function LiveCoachRefresh() {
  const router = useRouter();
  useEffect(() => {
    let lastRefresh = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 30_000) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
