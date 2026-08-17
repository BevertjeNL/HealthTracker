import { NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getValidAccessToken } from "@/lib/strava";

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number;
  average_cadence?: number;
  suffer_score?: number;
};

function paceMinPerKm(avgSpeedMPerS?: number) {
  if (!avgSpeedMPerS) return null;
  const minPerKm = 1000 / avgSpeedMPerS / 60;
  return Number.isFinite(minPerKm) ? minPerKm : null;
}

async function handleSync(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-cron-secret") ?? authHeader?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();

  const res = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=50",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: 502 });
  }
  const stravaActivities = (await res.json()) as StravaActivity[];

  let upserted = 0;
  for (const a of stravaActivities) {
    const values = {
      stravaId: String(a.id),
      name: a.name,
      type: a.type,
      startDate: new Date(a.start_date),
      distanceM: a.distance,
      movingTimeS: a.moving_time,
      elapsedTimeS: a.elapsed_time,
      elevationGainM: a.total_elevation_gain,
      avgHeartRate: a.average_heartrate ?? null,
      maxHeartRate: a.max_heartrate ?? null,
      avgPaceMinPerKm: paceMinPerKm(a.average_speed),
      avgCadence: a.average_cadence ?? null,
      sufferScore: a.suffer_score ?? null,
      raw: a,
    };
    await db
      .insert(activities)
      .values(values)
      .onConflictDoUpdate({ target: activities.stravaId, set: values });
    upserted++;
  }

  return NextResponse.json({ synced: upserted });
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}
