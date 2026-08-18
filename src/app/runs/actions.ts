"use server";

import { revalidatePath } from "next/cache";
import { syncStravaRuns } from "@/lib/sync";

export async function syncRunsAction(): Promise<{ synced?: number; error?: string }> {
  try {
    const result = await syncStravaRuns();
    revalidatePath("/runs");
    revalidatePath("/");
    return result;
  } catch (err) {
    return { error: (err as Error).message };
  }
}
