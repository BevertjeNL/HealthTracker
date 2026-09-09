import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { hasAuthenticatedSession } from "@/lib/session-server";
import { getDetailedActivity } from "@/lib/strava";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAuthenticatedSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [activity] = await db.select().from(activities).where(eq(activities.id, Number(id))).limit(1);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  try {
    const detail = await getDetailedActivity(activity.stravaId);
    await db.update(activities).set({ raw: detail }).where(eq(activities.id, activity.id));
    const splits = Array.isArray(detail.splits_metric) ? detail.splits_metric.length : 0;
    return NextResponse.json({ splits });
  } catch {
    return NextResponse.json({ error: "Strava detail sync failed" }, { status: 502 });
  }
}
