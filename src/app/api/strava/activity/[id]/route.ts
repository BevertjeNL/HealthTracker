import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { hasAuthenticatedSession } from "@/lib/session-server";
import { getDetailedActivity } from "@/lib/strava";
import { parseActivityId } from "@/lib/activity-id";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAuthenticatedSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const activityId = parseActivityId(id);
  if (activityId === null) {
    return NextResponse.json({ error: "Invalid activity ID" }, { status: 400 });
  }
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  try {
    const detail = await getDetailedActivity(activity.stravaId);
    await db.update(activities).set({ raw: { ...detail, _coach_detail_loaded: true } }).where(eq(activities.id, activity.id));
    const splits = Array.isArray(detail.splits_metric) ? detail.splits_metric.length : 0;
    return NextResponse.json({ splits });
  } catch {
    return NextResponse.json({ error: "Strava detail sync failed" }, { status: 502 });
  }
}
