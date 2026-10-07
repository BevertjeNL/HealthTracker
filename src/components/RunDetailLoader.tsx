"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function RunDetailLoader({ activityId }: { activityId: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  useEffect(() => {
    let active = true;
    fetch(`/api/strava/activity/${activityId}`, { method: "POST" })
      .then((response) => { if (!response.ok) throw new Error(); if (active) router.refresh(); })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [activityId, router]);
  return <p className="c-detail-loading" role="status">{status === "loading" ? "Strava-details worden opgehaald voor je loopanalyse…" : "Strava-details zijn nu niet beschikbaar. Probeer het later opnieuw via de knop bij de kilometeranalyse."}</p>;
}
