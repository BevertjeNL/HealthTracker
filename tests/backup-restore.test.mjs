import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { BACKUP_READ_SQL, restoreQueries } from "../src/lib/backup-sql.ts";

const schema = `
  CREATE TABLE activities (
    id serial PRIMARY KEY, strava_id text NOT NULL UNIQUE, name text, type text,
    start_date timestamptz NOT NULL, distance_m real, moving_time_s integer,
    elapsed_time_s integer, elevation_gain_m real, avg_heart_rate real,
    max_heart_rate real, avg_pace_min_per_km real, avg_cadence real,
    suffer_score real, kind_override text, raw jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE health_metrics (
    id serial PRIMARY KEY, date date NOT NULL UNIQUE, resting_heart_rate real,
    hrv_ms real, cardio_recovery_1m real, walking_heart_rate_average real,
    vo2_max real, sleep_hours real, sleep_score real, steps real,
    active_energy_kcal real, weight_kg real, oxygen_saturation_pct real,
    respiratory_rate real, exercise_minutes real, daylight_minutes real,
    walking_speed_kmh real, walking_steadiness_pct real,
    six_minute_walk_distance_m real, running_power_w real,
    running_stride_length_m real, running_vertical_oscillation_cm real,
    running_ground_contact_time_ms real, raw jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE training_goals (
    id integer PRIMARY KEY, distance_m integer NOT NULL, race_date date NOT NULL,
    target_pace_sec_per_km integer NOT NULL, updated_at timestamptz NOT NULL
  );
`;

function sampleData() {
  return {
    activities: [{
      id: 4, strava_id: "synthetic-activity", name: "Synthetic run", type: "Run",
      start_date: "2026-11-18T06:00:00.000Z", distance_m: 5200,
      moving_time_s: 1800, elapsed_time_s: 1850, elevation_gain_m: 11,
      avg_heart_rate: 142, max_heart_rate: 160, avg_pace_min_per_km: 5.77,
      avg_cadence: 171, suffer_score: null, kind_override: "easy",
      raw: { splits_metric: [{ distance: 1000, elapsed_time: 350 }] },
      created_at: "2026-11-18T07:00:00.000Z",
    }],
    health_metrics: [{
      id: 7, date: "2026-11-18", resting_heart_rate: 52, hrv_ms: 64,
      cardio_recovery_1m: null, walking_heart_rate_average: null,
      vo2_max: null, sleep_hours: 7.5, sleep_score: null, steps: 1200,
      active_energy_kcal: 100, weight_kg: 70.5, oxygen_saturation_pct: null,
      respiratory_rate: null, exercise_minutes: null, daylight_minutes: null,
      walking_speed_kmh: null, walking_steadiness_pct: null,
      six_minute_walk_distance_m: null, running_power_w: null,
      running_stride_length_m: null, running_vertical_oscillation_cm: null,
      running_ground_contact_time_ms: null, raw: { source: "synthetic" },
      created_at: "2026-11-18T08:00:00.000Z",
    }],
    training_goals: [{
      id: 1, distance_m: 10000, race_date: "2027-04-18",
      target_pace_sec_per_km: 330, updated_at: "2026-11-18T09:00:00.000Z",
    }, {
      id: 2, distance_m: 21097, race_date: "2027-10-17",
      target_pace_sec_per_km: 350, updated_at: "2026-11-18T09:00:00.000Z",
    }],
  };
}

async function restore(db, data, expectedSnapshotDigest) {
  const [{ snapshot_digest: currentDigest }] = (await db.query(BACKUP_READ_SQL)).rows;
  await db.exec("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    for (const { text, params } of restoreQueries(data, expectedSnapshotDigest ?? currentDigest)) await db.query(text, params);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

test("restore replaces all three app tables atomically and preserves dates, details and serial IDs", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(`
      INSERT INTO activities (strava_id, start_date) VALUES ('old-run', '2025-01-01T00:00:00Z');
      INSERT INTO health_metrics (date) VALUES ('2025-01-01');
      INSERT INTO training_goals VALUES (1, 5000, '2025-01-01', 360, '2025-01-01T00:00:00Z');
    `);
    await restore(db, sampleData());

    const runs = await db.query("SELECT id, strava_id, kind_override, raw->'splits_metric'->0->>'distance' AS split FROM activities");
    const health = await db.query("SELECT id, date::text AS date, weight_kg FROM health_metrics");
    const goals = await db.query("SELECT id, race_date::text AS race_date, distance_m FROM training_goals ORDER BY id");
    assert.deepEqual(runs.rows, [{ id: 4, strava_id: "synthetic-activity", kind_override: "easy", split: "1000" }]);
    assert.equal(health.rows.length, 1);
    assert.deepEqual({ id: health.rows[0].id, date: health.rows[0].date, weight: health.rows[0].weight_kg },
      { id: 7, date: "2026-11-18", weight: 70.5 });
    assert.deepEqual(goals.rows, [{ id: 1, race_date: "2027-04-18", distance_m: 10000 }, { id: 2, race_date: "2027-10-17", distance_m: 21097 }]);
    const exported = (await db.query(BACKUP_READ_SQL)).rows[0].data;
    assert.equal(exported.health_metrics[0].date, "2026-11-18");
    assert.equal(exported.training_goals[0].race_date, "2027-04-18");
    assert.equal(exported.training_goals[1].race_date, "2027-10-17");
    assert.match(exported.activities[0].start_date, /Z$/);

    const next = await db.query("SELECT nextval(pg_get_serial_sequence('activities','id'))::int AS activity, nextval(pg_get_serial_sequence('health_metrics','id'))::int AS health");
    assert.deepEqual(next.rows, [{ activity: 5, health: 8 }]);
  } finally {
    await db.close();
  }
});

test("a write after the safety backup aborts restore before any table is truncated", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(`
      INSERT INTO activities (strava_id, start_date) VALUES ('preserve-run', '2025-01-01T00:00:00Z');
      INSERT INTO health_metrics (date) VALUES ('2025-01-01');
    `);
    const oldDigest = (await db.query(BACKUP_READ_SQL)).rows[0].snapshot_digest;
    await db.exec("INSERT INTO health_metrics (date) VALUES ('2025-01-02')");
    await assert.rejects(restore(db, sampleData(), oldDigest), (error) => error.code === "22012");

    const runs = await db.query("SELECT strava_id FROM activities");
    const health = await db.query("SELECT date::text AS date FROM health_metrics ORDER BY date");
    assert.deepEqual(runs.rows, [{ strava_id: "preserve-run" }]);
    assert.deepEqual(health.rows, [{ date: "2025-01-01" }, { date: "2025-01-02" }]);
  } finally {
    await db.close();
  }
});

test("a failed restore rolls back the truncation and leaves previous data intact", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(`
      INSERT INTO activities (strava_id, start_date) VALUES ('preserve-run', '2025-01-01T00:00:00Z');
      INSERT INTO health_metrics (date) VALUES ('2025-01-01');
      INSERT INTO training_goals VALUES (1, 5000, '2025-01-01', 360, '2025-01-01T00:00:00Z');
    `);
    const invalid = sampleData();
    invalid.activities.push({ ...invalid.activities[0], id: 5 }); // Duplicate Strava ID violates a unique constraint.
    await assert.rejects(restore(db, invalid));

    const runs = await db.query("SELECT strava_id FROM activities");
    const health = await db.query("SELECT date::text AS date FROM health_metrics");
    const goals = await db.query("SELECT distance_m FROM training_goals");
    assert.deepEqual(runs.rows, [{ strava_id: "preserve-run" }]);
    assert.deepEqual(health.rows, [{ date: "2025-01-01" }]);
    assert.deepEqual(goals.rows, [{ distance_m: 5000 }]);
  } finally {
    await db.close();
  }
});
