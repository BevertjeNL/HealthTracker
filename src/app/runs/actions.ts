"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { syncStravaRuns } from "@/lib/sync";
import { hasAuthenticatedSession } from "@/lib/session-server";

export async function syncRunsAction(): Promise<{ synced?: number; error?: string }> {
  if (!(await hasAuthenticatedSession())) {
    return { error: "Je sessie is verlopen. Log opnieuw in." };
  }

  try {
    const result = await syncStravaRuns();
    revalidatePath("/runs");
    revalidatePath("/");
    return result;
  } catch {
    return { error: "Synchroniseren is mislukt. Probeer het later opnieuw." };
  }
}

// kind: "race" marks a run as race, "not_race" rejects a race guess, null removes the manual choice.
export async function setRunKindAction(id: number, kind: "race" | "not_race" | null): Promise<{ ok?: true; error?: string }> {
  if (!(await hasAuthenticatedSession())) return { error: "Je sessie is verlopen. Log opnieuw in." };
  if (!Number.isInteger(id) || id <= 0 || (kind !== null && kind !== "race" && kind !== "not_race")) return { error: "Ongeldige invoer." };
  try {
    await db.update(activities).set({ kindOverride: kind }).where(eq(activities.id, id));
    revalidatePath("/runs");
    revalidatePath(`/runs/${id}`);
    return { ok: true };
  } catch {
    return { error: "Opslaan is mislukt. Probeer het later opnieuw." };
  }
}
