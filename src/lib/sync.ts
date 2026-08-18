import { notInArray } from "drizzle-orm";
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

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

// Strava paginates at up to 200/page; walk pages until one comes back short of
// a full page, which means we've reached the end of the athlete's history.
async function fetchAllRuns(accessToken: string): Promise<StravaActivity[]> {
  const perPage = 200;
  const runs: StravaActivity[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Strava API error (page ${page}): ${await res.text()}`);
    }
    const pageActivities = (await res.json()) as StravaActivity[];
    runs.push(...pageActivities.filter((a) => RUN_TYPES.has(a.type)));
    if (pageActivities.length < perPage) break;
  }
  return runs;
}

export async function syncStravaRuns(): Promise<{ synced: number; deleted: number }> {
  const accessToken = await getValidAccessToken();
  const stravaActivities = await fetchAllRuns(accessToken);

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

  // fetchAllRuns walks the athlete's full history, so any run currently in the
  // DB but absent from this result set was deleted (or un-Run-ified) on Strava.
  const currentStravaIds = stravaActivities.map((a) => String(a.id));
  const deleteResult =
    currentStravaIds.length > 0
      ? await db
          .delete(activities)
          .where(notInArray(activities.stravaId, currentStravaIds))
          .returning({ id: activities.id })
      : [];

  return { synced: upserted, deleted: deleteResult.length };
}
