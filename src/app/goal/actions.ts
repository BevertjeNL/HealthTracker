"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { trainingGoals } from "@/db/schema";
import { goalDate, parseGoalInput } from "@/lib/goal-plan";
import { hasAuthenticatedSession } from "@/lib/session-server";

export type GoalActionState = { message: string; ok: boolean };

export async function saveTrainingGoalAction(_previous: GoalActionState, formData: FormData): Promise<GoalActionState> {
  if (!(await hasAuthenticatedSession())) return { message: "Je sessie is verlopen. Log opnieuw in.", ok: false };
  const parsed = parseGoalInput(formData.get("distanceM"), formData.get("raceDate"), formData.get("targetPace"), goalDate(new Date()));
  if (!parsed.goal) return { message: parsed.error ?? "Controleer je doel.", ok: false };
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : null;
  if (rawId !== null && id === null) return { message: "Ongeldige wedstrijd. Herlaad de pagina.", ok: false };
  try {
    const duplicate = await db.select({ id: trainingGoals.id }).from(trainingGoals).where(id === null ? eq(trainingGoals.raceDate, parsed.goal.raceDate) : and(eq(trainingGoals.raceDate, parsed.goal.raceDate), ne(trainingGoals.id, id))).limit(1);
    if (duplicate.length) return { message: "Er staat al een wedstrijd op deze datum.", ok: false };
    if (id !== null) {
      const changed = await db.update(trainingGoals).set({ ...parsed.goal, updatedAt: new Date() }).where(eq(trainingGoals.id, id)).returning({ id: trainingGoals.id });
      if (!changed.length) return { message: "Deze wedstrijd bestaat niet meer. Herlaad de pagina.", ok: false };
    } else {
      const [{ count, nextId }] = await db.select({ count: sql<number>`count(*)::int`, nextId: sql<number>`coalesce(max(${trainingGoals.id}), 0)::int + 1` }).from(trainingGoals);
      if (count >= 20) return { message: "Je kunt maximaal 20 wedstrijden bewaren.", ok: false };
      await db.insert(trainingGoals).values({ id: nextId, ...parsed.goal, updatedAt: new Date() });
    }
    revalidatePath("/");
    revalidatePath("/goal");
    return { message: id === null ? "Wedstrijd toegevoegd." : "Wedstrijd bijgewerkt.", ok: true };
  } catch {
    return { message: "Opslaan is mislukt. Probeer het later opnieuw.", ok: false };
  }
}

export async function deleteTrainingGoalAction(formData: FormData): Promise<void> {
  if (!(await hasAuthenticatedSession())) return;
  const rawId = formData.get("id");
  if (typeof rawId !== "string" || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) return;
  await db.delete(trainingGoals).where(eq(trainingGoals.id, Number(rawId)));
  revalidatePath("/");
  revalidatePath("/goal");
}
