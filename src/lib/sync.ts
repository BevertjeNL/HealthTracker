import { desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { preserveDetailedRaw } from "@/lib/activity-raw";
import { getDetailedActivity, getValidAccessToken } from "@/lib/strava";
import { stravaObjectId } from "@/lib/strava-id";

type StravaActivity = {
  id: number;
  id_str?: string;
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

// Newest runs without kilometer splits get their detail right after a sync. The cap keeps one sync well inside
// Strava's rate limit (100 requests per 15 minutes) and the function time limit; older runs follow on later syncs
// or through the backfill button on /runs.
const DETAIL_PER_SYNC = 6;
const DETAIL_TIME_BUDGET_MS = 20_000;

// Mirrors hasDetailedRaw() in activity-raw.ts.
const missingDetailCondition = sql`NOT COALESCE(${activities.raw} ? 'splits_metric' OR ${activities.raw}->>'_coach_detail_loaded' = 'true', false)`;

async function fetchMissingDetails(accessToken: string): Promise<number> {
  const startedAt = Date.now();
  const missing = await db.select({ id: activities.id, stravaId: activities.stravaId }).from(activities).where(missingDetailCondition).orderBy(desc(activities.startDate)).limit(DETAIL_PER_SYNC);
  let fetched = 0;
  for (const run of missing) {
    if (Date.now() - startedAt > DETAIL_TIME_BUDGET_MS) break;
    try {
      const detail = await getDetailedActivity(run.stravaId, accessToken);
      await db.update(activities).set({ raw: { ...detail, _coach_detail_loaded: true } }).where(eq(activities.id, run.id));
      fetched++;
    } catch {
      break; // rate limit or Strava hiccup: stop here, the next sync continues with the same runs
    }
  }
  return fetched;
}

export async function syncStravaRuns(): Promise<{ synced: number; deleted: number; detailed: number }> {
  const accessToken = await getValidAccessToken();
  const stravaActivities = await fetchAllRuns(accessToken);
  // Resolve all IDs before writing or deleting. Invalid IDs must abort the sync.
  const runs = stravaActivities.map((activity) => ({
    activity,
    stravaId: stravaObjectId(activity),
  }));

  let upserted = 0;
  for (const { activity: a, stravaId } of runs) {
    const values = {
      stravaId,
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
      .onConflictDoUpdate({
        target: activities.stravaId,
        // Keep detailed splits fetched via /api/strava/activity/[id] (Gotcha 10).
        set: { ...values, raw: preserveDetailedRaw(activities.raw) },
      });
    upserted++;
  }

  // fetchAllRuns walks the athlete's full history, so any run currently in the
  // DB but absent from this result set was deleted (or un-Run-ified) on Strava.
  const currentStravaIds = runs.map(({ stravaId }) => stravaId);
  const deleteResult =
    currentStravaIds.length > 0
      ? await db
          .delete(activities)
          .where(notInArray(activities.stravaId, currentStravaIds))
          .returning({ id: activities.id })
      : [];

  // Detail failures never fail the sync itself: the summaries above are already saved.
  const detailed = await fetchMissingDetails(accessToken).catch(() => 0);
  return { synced: upserted, deleted: deleteResult.length, detailed };
}
