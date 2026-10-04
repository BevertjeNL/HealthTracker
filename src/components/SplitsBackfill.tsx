"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Loads detailed Strava splits for runs that don't have them yet, one at a time through the
// existing session-protected endpoint. Strava allows 100 requests per 15 minutes, so stay modest.
export function SplitsBackfill({ runs }: { runs: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [message, setMessage] = useState("");
  const batch = runs.slice(0, 10);
  if (!batch.length) return null;

  const start = async () => {
    setBusy(true); setDone(0); setMessage("");
    let count = 0;
    for (const run of batch) {
      try {
        const response = await fetch(`/api/strava/activity/${run.id}`, { method: "POST" });
        if (response.status === 401) { setMessage("Je sessie is verlopen. Log opnieuw in."); break; }
        if (!response.ok) { setMessage("Strava weigerde een verzoek (waarschijnlijk de limiet). Probeer het over 15 minuten opnieuw."); break; }
        count++; setDone(count);
      } catch { setMessage("Verbinding mislukt. Probeer het opnieuw."); break; }
    }
    setBusy(false);
    if (count) router.refresh();
  };

  return <div className="an-backfill"><div><b>{runs.length} runs zonder kilometergegevens</b><p>Haal de splits van de {batch.length} meest recente op voor een scherpere analyse van je loopstijl.</p>{message && <p className="split-error" role="alert">{message}</p>}</div><button type="button" onClick={start} disabled={busy}>{busy ? `Ophalen… ${done}/${batch.length}` : `Haal ${batch.length} runs op`}</button></div>;
}
