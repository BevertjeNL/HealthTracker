import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { neon } from "@neondatabase/serverless";

const zipPath = process.argv[2];
if (!zipPath || !process.env.DATABASE_URL) {
  console.error("Gebruik: node --env-file=.env.local scripts/import-apple-health-export.mjs /pad/naar/export.zip");
  process.exit(1);
}

const metricTypes = {
  HKQuantityTypeIdentifierOxygenSaturation: ["oxygen_saturation_pct", "avg", 100],
  HKQuantityTypeIdentifierRespiratoryRate: ["respiratory_rate", "avg", 1],
  HKQuantityTypeIdentifierAppleExerciseTime: ["exercise_minutes", "sum", 1],
  HKQuantityTypeIdentifierTimeInDaylight: ["daylight_minutes", "sum", 1],
  HKQuantityTypeIdentifierWalkingSpeed: ["walking_speed_kmh", "avg", 1],
  HKQuantityTypeIdentifierAppleWalkingSteadiness: ["walking_steadiness_pct", "avg", 100],
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: ["six_minute_walk_distance_m", "last", 1],
  HKQuantityTypeIdentifierRunningPower: ["running_power_w", "avg", 1],
  HKQuantityTypeIdentifierRunningStrideLength: ["running_stride_length_m", "avg", 1],
  HKQuantityTypeIdentifierRunningVerticalOscillation: ["running_vertical_oscillation_cm", "avg", 1],
  HKQuantityTypeIdentifierRunningGroundContactTime: ["running_ground_contact_time_ms", "avg", 1],
};

const fields = [...new Set(Object.values(metricTypes).map(([field]) => field))];
const days = new Map();
const counts = Object.fromEntries(fields.map((field) => [field, 0]));
const unzip = spawn("unzip", ["-p", zipPath, "apple_health_export/export.xml"]);
const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.includes("<Record type=")) continue;
  const type = line.match(/ type="([^"]+)"/)?.[1];
  const config = metricTypes[type];
  if (!config) continue;
  const date = line.match(/ startDate="(\d{4}-\d{2}-\d{2})/)?.[1];
  const raw = Number(line.match(/ value="([^"]+)"/)?.[1]);
  if (!date || !Number.isFinite(raw)) continue;
  const [field, aggregation, multiplier] = config;
  const value = raw * multiplier;
  const day = days.get(date) ?? { date, buckets: {} };
  const bucket = day.buckets[field] ?? { sum: 0, count: 0, last: null, aggregation };
  bucket.sum += value;
  bucket.count += 1;
  bucket.last = value;
  day.buckets[field] = bucket;
  days.set(date, day);
  counts[field] += 1;
}

const unzipExit = await new Promise((resolve) => unzip.on("close", resolve));
if (unzipExit !== 0) throw new Error(`Apple Health-export kon niet worden gelezen (unzip ${unzipExit})`);

const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ date, buckets }) => {
  const row = { date };
  for (const [field, bucket] of Object.entries(buckets)) {
    row[field] = bucket.aggregation === "sum"
      ? bucket.sum
      : bucket.aggregation === "last"
        ? bucket.last
        : bucket.sum / bucket.count;
  }
  return row;
});

const sql = neon(process.env.DATABASE_URL);
for (let index = 0; index < rows.length; index += 400) {
  const json = JSON.stringify(rows.slice(index, index + 400));
  await sql`
    insert into health_metrics (
      date, oxygen_saturation_pct, respiratory_rate, exercise_minutes, daylight_minutes,
      walking_speed_kmh, walking_steadiness_pct, six_minute_walk_distance_m,
      running_power_w, running_stride_length_m, running_vertical_oscillation_cm,
      running_ground_contact_time_ms
    )
    select
      x.date::date, x.oxygen_saturation_pct, x.respiratory_rate, x.exercise_minutes, x.daylight_minutes,
      x.walking_speed_kmh, x.walking_steadiness_pct, x.six_minute_walk_distance_m,
      x.running_power_w, x.running_stride_length_m, x.running_vertical_oscillation_cm,
      x.running_ground_contact_time_ms
    from json_to_recordset(${json}::json) as x(
      date text, oxygen_saturation_pct real, respiratory_rate real, exercise_minutes real,
      daylight_minutes real, walking_speed_kmh real, walking_steadiness_pct real,
      six_minute_walk_distance_m real, running_power_w real, running_stride_length_m real,
      running_vertical_oscillation_cm real, running_ground_contact_time_ms real
    )
    on conflict (date) do update set
      oxygen_saturation_pct = coalesce(excluded.oxygen_saturation_pct, health_metrics.oxygen_saturation_pct),
      respiratory_rate = coalesce(excluded.respiratory_rate, health_metrics.respiratory_rate),
      exercise_minutes = coalesce(excluded.exercise_minutes, health_metrics.exercise_minutes),
      daylight_minutes = coalesce(excluded.daylight_minutes, health_metrics.daylight_minutes),
      walking_speed_kmh = coalesce(excluded.walking_speed_kmh, health_metrics.walking_speed_kmh),
      walking_steadiness_pct = coalesce(excluded.walking_steadiness_pct, health_metrics.walking_steadiness_pct),
      six_minute_walk_distance_m = coalesce(excluded.six_minute_walk_distance_m, health_metrics.six_minute_walk_distance_m),
      running_power_w = coalesce(excluded.running_power_w, health_metrics.running_power_w),
      running_stride_length_m = coalesce(excluded.running_stride_length_m, health_metrics.running_stride_length_m),
      running_vertical_oscillation_cm = coalesce(excluded.running_vertical_oscillation_cm, health_metrics.running_vertical_oscillation_cm),
      running_ground_contact_time_ms = coalesce(excluded.running_ground_contact_time_ms, health_metrics.running_ground_contact_time_ms)
  `;
}

console.log(JSON.stringify({ importedDays: rows.length, sourceRecords: counts }, null, 2));
