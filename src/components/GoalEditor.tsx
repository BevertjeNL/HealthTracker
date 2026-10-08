"use client";

import { useActionState } from "react";
import { saveTrainingGoalAction, type GoalActionState } from "@/app/goal/actions";
import { GOAL_DISTANCES, paceText, type TrainingGoal } from "@/lib/goal-plan";

const initial: GoalActionState = { message: "", ok: false };

export function GoalEditor({ goal, defaultDate, minDate }: { goal: TrainingGoal | null; defaultDate: string; minDate: string }) {
  const [state, formAction, pending] = useActionState(saveTrainingGoalAction, initial);
  return <form className="g-form" action={formAction}>
    <label>Afstand<select name="distanceM" defaultValue={goal?.distanceM ?? 21097}>{GOAL_DISTANCES.map((item) => <option key={item.meters} value={item.meters}>{item.label}</option>)}</select></label>
    <label>Wedstrijddatum<input type="date" name="raceDate" required min={minDate} defaultValue={goal?.raceDate ?? defaultDate} /></label>
    <label>Doeltempo per km<input type="text" name="targetPace" required inputMode="numeric" pattern="[0-9]{1,2}:[0-5][0-9]" placeholder="5:20" defaultValue={goal ? paceText(goal.targetPaceSecPerKm) : "5:20"} aria-describedby="goal-pace-help" /></label>
    <p id="goal-pace-help">Schrijf minuten:seconden per km. Dit is je ambitie; de coach past de training aan je recente basis aan.</p>
    <button type="submit" disabled={pending}>{pending ? "Schema maken…" : goal ? "Doel en schema bijwerken" : "Maak mijn schema"}</button>
    {state.message && <p className={state.ok ? "g-form-success" : "g-form-error"} role="status">{state.message}</p>}
  </form>;
}
