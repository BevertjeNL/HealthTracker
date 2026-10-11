"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";
import { hasAuthenticatedSession } from "@/lib/session-server";
import { parseWeightCorrection } from "@/lib/weight-correction";

export type WeightActionState = { message: string; ok: boolean };

export async function correctWeightAction(_previous: WeightActionState, formData: FormData): Promise<WeightActionState> {
  if (!(await hasAuthenticatedSession())) return { message: "Je sessie is verlopen. Log opnieuw in.", ok: false };
  const correction = parseWeightCorrection(formData.get("date"), formData.get("operation"), formData.get("weightKg"));
  if (!correction) return { message: "Controleer de datum en het gewicht (20–400 kg, maximaal twee decimalen).", ok: false };

  try {
    const updated = await db.update(healthMetrics)
      .set({ weightKg: correction.weightKg })
      .where(and(eq(healthMetrics.date, correction.date), isNotNull(healthMetrics.weightKg)))
      .returning({ date: healthMetrics.date });
    if (!updated.length) return { message: "Deze meting bestaat niet meer. Vernieuw de pagina.", ok: false };
    revalidatePath("/");
    return { message: correction.weightKg == null ? "De gewichtsmeting is verwijderd." : "De gewichtsmeting is aangepast.", ok: true };
  } catch {
    return { message: "Opslaan is mislukt. Probeer het later opnieuw.", ok: false };
  }
}
