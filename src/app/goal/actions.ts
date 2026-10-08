"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trainingGoals } from "@/db/schema";
import { goalDate, parseGoalInput } from "@/lib/goal-plan";
import { hasAuthenticatedSession } from "@/lib/session-server";

export type GoalActionState = { message: string; ok: boolean };

export async function saveTrainingGoalAction(_previous: GoalActionState, formData: FormData): Promise<GoalActionState> {
  if (!(await hasAuthenticatedSession())) return { message: "Je sessie is verlopen. Log opnieuw in.", ok: false };
  const parsed = parseGoalInput(formData.get("distanceM"), formData.get("raceDate"), formData.get("targetPace"), goalDate(new Date()));
  if (!parsed.goal) return { message: parsed.error ?? "Controleer je doel.", ok: false };
  try {
    await db.insert(trainingGoals).values({ id: 1, ...parsed.goal, updatedAt: new Date() }).onConflictDoUpdate({ target: trainingGoals.id, set: { ...parsed.goal, updatedAt: new Date() } });
    revalidatePath("/");
    revalidatePath("/goal");
    return { message: "Je doel en schema zijn bijgewerkt.", ok: true };
  } catch {
    return { message: "Opslaan is mislukt. Probeer het later opnieuw.", ok: false };
  }
}
