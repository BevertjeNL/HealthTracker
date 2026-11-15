"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRunKindAction } from "@/app/runs/actions";
import type { KindOverride } from "@/lib/run-analysis";

const CHOICES: Array<{ kind: KindOverride; label: string }> = [
  { kind: "easy", label: "Rustige duurloop" },
  { kind: "long", label: "Lange duur" },
  { kind: "interval", label: "Training met snelle delen" },
  { kind: "race", label: "Wedstrijd" },
];

/** Wat voor training was dit? Eén vraag, vier antwoorden; jouw keuze gaat boven het Strava-label en de herkenning uit rondetijden. */
export function RunTypeChoice({ runId, kind, sourceLabel, override, ask, askOnly = false }: { runId: number; kind: KindOverride; sourceLabel: string; override: string | null; ask?: { summary: string; steadyKind: "easy" | "long" } | null; askOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const save = (next: KindOverride | null) => startTransition(async () => {
    setError("");
    const result = await setRunKindAction(runId, next);
    if (result.error) setError(result.error); else router.refresh();
  });

  return <div className="p-typechoice">
    {ask && <div className="p-ask" role="group" aria-label="Wat voor training was dit?">
      <div><strong>Was het snelle deel bedoeld?</strong><p>Je liep {ask.summary}. Jouw antwoord bepaalt hoe ik de run beoordeel.</p></div>
      <div className="p-ask-actions"><button type="button" disabled={pending} onClick={() => save("interval")}>Ja, bewust</button><button type="button" className="ghost" disabled={pending} onClick={() => save(ask.steadyKind)}>Nee, te snel gestart</button></div>
    </div>}
    {!askOnly && <div className="an-marker"><span>Type bepaald door {sourceLabel}</span>
      {CHOICES.map((choice) => <button key={choice.kind} type="button" className="ghost" aria-pressed={kind === choice.kind} disabled={pending || kind === choice.kind} onClick={() => save(choice.kind)}>{choice.label}</button>)}
      {override && <button type="button" className="ghost" disabled={pending} onClick={() => save(null)}>Herstel automatisch</button>}
    </div>}
    {error && <p className="split-error" role="alert">{error}</p>}
  </div>;
}
