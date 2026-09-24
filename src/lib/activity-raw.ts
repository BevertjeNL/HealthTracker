import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// Conflict-update expression for activities.raw during a Strava sync.
//
// The sync only has the *summary* activity, while /api/strava/activity/[id]
// stores the *detailed* activity (with splits_metric). Blindly writing the
// summary would drop fetched kilometer splits on every sync. When the stored
// raw already contains splits_metric we merge instead: `existing || summary`
// refreshes every key the summary carries (name, workout_type, …) and keeps
// detail-only keys such as splits_metric, laps and best_efforts. Otherwise the
// summary simply replaces raw, as before.
export function preserveDetailedRaw(rawColumn: PgColumn): SQL {
  return sql`CASE
    WHEN jsonb_typeof(${rawColumn}) = 'object'
      AND ${rawColumn} ? 'splits_metric'
      AND jsonb_typeof(excluded.raw) = 'object'
    THEN ${rawColumn} || excluded.raw
    ELSE excluded.raw
  END`;
}
