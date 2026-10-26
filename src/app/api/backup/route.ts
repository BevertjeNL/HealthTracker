import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { backupFilename, buildBackup } from "@/lib/backup";
import { hasAuthenticatedSession } from "@/lib/session-server";

export const dynamic = "force-dynamic";

// Session-protected download of the whole database (runs incl. raw Strava JSON, Health metrics, goal), without Strava tokens.
export async function GET() {
  if (!(await hasAuthenticatedSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [runs, health, goals] = await Promise.all([
      db.select().from(activities),
      db.select().from(healthMetrics),
      db.select().from(trainingGoals),
    ]);
    const now = new Date();
    const body = JSON.stringify(buildBackup({ activities: runs, healthMetrics: health, trainingGoals: goals }, now));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFilename(now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Back-up maken mislukt" }, { status: 500 });
  }
}
