"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRunKindAction } from "@/app/runs/actions";

type Kind = "race" | "not_race" | null;

export function RaceMarker({ runId, isRace, override, variant = "toggle" }: { runId: number; isRace: boolean; override: string | null; variant?: "toggle" | "suggestion" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const save = (kind: Kind) => startTransition(async () => {
    setError("");
    const result = await setRunKindAction(runId, kind);
    if (result.error) setError(result.error); else router.refresh();
  });

  if (variant === "suggestion") return <div className="an-marker"><button type="button" disabled={pending} onClick={() => save("race")}>Dit was een wedstrijd</button><button type="button" className="ghost" disabled={pending} onClick={() => save("not_race")}>Geen wedstrijd</button>{error && <p className="split-error" role="alert">{error}</p>}</div>;

  return <div className="an-marker"><span>{isRace ? "Geteld als wedstrijd" : "Geteld als training"}{override ? " (jouw keuze)" : ""}</span>
    {isRace ? <button type="button" className="ghost" disabled={pending} onClick={() => save("not_race")}>Toch een training</button> : <button type="button" disabled={pending} onClick={() => save("race")}>Markeer als wedstrijd</button>}
    {override && <button type="button" className="ghost" disabled={pending} onClick={() => save(null)}>Herstel automatisch</button>}
    {error && <p className="split-error" role="alert">{error}</p>}</div>;
}
