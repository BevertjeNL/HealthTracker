"use server";

import { revalidatePath } from "next/cache";
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
