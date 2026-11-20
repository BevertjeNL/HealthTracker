import type { BackupData } from "./backup-format";

// Keep this one expression shared by the export and the guarded restore. A
// jsonb value has a stable textual representation, and each array is ordered
// by its primary key. Date-only values stay YYYY-MM-DD; timestamps become UTC.
const BACKUP_STATE_EXPRESSION = `jsonb_build_object(
  'activities', COALESCE((SELECT jsonb_agg(
    to_jsonb(a) || jsonb_build_object(
      'start_date', to_char(a.start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'created_at', to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) ORDER BY a.id
  ) FROM activities a), '[]'::jsonb),
  'health_metrics', COALESCE((SELECT jsonb_agg(
    to_jsonb(h) || jsonb_build_object(
      'created_at', to_char(h.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) ORDER BY h.id
  ) FROM health_metrics h), '[]'::jsonb),
  'training_goals', COALESCE((SELECT jsonb_agg(
    to_jsonb(g) || jsonb_build_object(
      'updated_at', to_char(g.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) ORDER BY g.id
  ) FROM training_goals g), '[]'::jsonb)
)`;

export const BACKUP_READ_SQL = `
  SELECT data, encode(sha256(convert_to(data::text, 'UTF8')), 'hex') AS snapshot_digest
  FROM (SELECT ${BACKUP_STATE_EXPRESSION} AS data) snapshot
`;

// A changed database raises PostgreSQL division_by_zero (22012), aborting the
// complete transaction before TRUNCATE. The denominator is data-dependent, so
// PostgreSQL cannot fold it into a constant division by zero during planning.
export const BACKUP_GUARD_SQL = `
  SELECT 1 / CASE WHEN encode(sha256(convert_to(data::text, 'UTF8')), 'hex') = $1
    THEN 1 ELSE 0 END AS snapshot_guard
  FROM (SELECT ${BACKUP_STATE_EXPRESSION} AS data) snapshot
`;

/** Prepared statements shared by Neon and the isolated PostgreSQL restore test. */
export function restoreQueries(data: BackupData, expectedSnapshotDigest: string): Array<{ text: string; params?: unknown[] }> {
  return [
    { text: "LOCK TABLE activities, health_metrics, training_goals IN ACCESS EXCLUSIVE MODE" },
    { text: BACKUP_GUARD_SQL, params: [expectedSnapshotDigest] },
    { text: "TRUNCATE TABLE activities, health_metrics, training_goals RESTART IDENTITY" },
    {
      text: `
        INSERT INTO activities (
          id, strava_id, name, type, start_date, distance_m, moving_time_s,
          elapsed_time_s, elevation_gain_m, avg_heart_rate, max_heart_rate,
          avg_pace_min_per_km, avg_cadence, suffer_score, kind_override, raw, created_at
        )
        SELECT id, strava_id, name, type, start_date, distance_m, moving_time_s,
          elapsed_time_s, elevation_gain_m, avg_heart_rate, max_heart_rate,
          avg_pace_min_per_km, avg_cadence, suffer_score, kind_override, raw, created_at
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer, strava_id text, name text, type text, start_date timestamptz,
          distance_m real, moving_time_s integer, elapsed_time_s integer,
          elevation_gain_m real, avg_heart_rate real, max_heart_rate real,
          avg_pace_min_per_km real, avg_cadence real, suffer_score real,
          kind_override text, raw jsonb, created_at timestamptz
        )
      `,
      params: [JSON.stringify(data.activities)],
    },
    {
      text: `
        INSERT INTO health_metrics (
          id, date, resting_heart_rate, hrv_ms, cardio_recovery_1m,
          walking_heart_rate_average, vo2_max, sleep_hours, sleep_score, steps,
          active_energy_kcal, weight_kg, oxygen_saturation_pct, respiratory_rate,
          exercise_minutes, daylight_minutes, walking_speed_kmh,
          walking_steadiness_pct, six_minute_walk_distance_m, running_power_w,
          running_stride_length_m, running_vertical_oscillation_cm,
          running_ground_contact_time_ms, raw, created_at
        )
        SELECT id, date, resting_heart_rate, hrv_ms, cardio_recovery_1m,
          walking_heart_rate_average, vo2_max, sleep_hours, sleep_score, steps,
          active_energy_kcal, weight_kg, oxygen_saturation_pct, respiratory_rate,
          exercise_minutes, daylight_minutes, walking_speed_kmh,
          walking_steadiness_pct, six_minute_walk_distance_m, running_power_w,
          running_stride_length_m, running_vertical_oscillation_cm,
          running_ground_contact_time_ms, raw, created_at
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer, date date, resting_heart_rate real, hrv_ms real,
          cardio_recovery_1m real, walking_heart_rate_average real, vo2_max real,
          sleep_hours real, sleep_score real, steps real, active_energy_kcal real,
          weight_kg real, oxygen_saturation_pct real, respiratory_rate real,
          exercise_minutes real, daylight_minutes real, walking_speed_kmh real,
          walking_steadiness_pct real, six_minute_walk_distance_m real,
          running_power_w real, running_stride_length_m real,
          running_vertical_oscillation_cm real, running_ground_contact_time_ms real,
          raw jsonb, created_at timestamptz
        )
      `,
      params: [JSON.stringify(data.health_metrics)],
    },
    {
      text: `
        INSERT INTO training_goals (id, distance_m, race_date, target_pace_sec_per_km, updated_at)
        SELECT id, distance_m, race_date, target_pace_sec_per_km, updated_at
        FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer, distance_m integer, race_date date,
          target_pace_sec_per_km integer, updated_at timestamptz
        )
      `,
      params: [JSON.stringify(data.training_goals)],
    },
    { text: "SELECT setval(pg_get_serial_sequence('activities', 'id'), COALESCE((SELECT max(id) FROM activities), 1), EXISTS (SELECT 1 FROM activities))" },
    { text: "SELECT setval(pg_get_serial_sequence('health_metrics', 'id'), COALESCE((SELECT max(id) FROM health_metrics), 1), EXISTS (SELECT 1 FROM health_metrics))" },
  ];
}
