import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { neon } from "@neondatabase/serverless";
import { HEALTH_METRIC_MAP, isValidHealthMetricValue, normalizeHealthMetricValue } from "../src/lib/health-import.ts";

// Eenmalige backfill uit een volledige Apple Health-export (export.zip).
// Vult ALLEEN lege velden (COALESCE) en overschrijft nooit een bestaande waarde. Kernmetingen (HRV, rusthartslag,
// stappen, gewicht ...) en uitgebreide metingen gaan door dezelfde plausibiliteitscontrole als de ingest-route.
// Met --dry-run wordt niets geschreven; er worden alleen aantallen getoond, nooit meetwaarden.

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const zipPath = args.find((arg) => !arg.startsWith("--"));
if (!zipPath || !process.env.DATABASE_URL) {
  console.error("Gebruik: node --env-file=.env.local scripts/import-apple-health-export.mjs [--dry-run] /pad/naar/export.zip");
  process.exit(1);
}

const APPLE_TYPES = {
  HKQuantityTypeIdentifierRestingHeartRate: "resting_heart_rate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "heart_rate_variability",
  HKQuantityTypeIdentifierHeartRateRecoveryOneMinute: "cardio_recovery",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walking_heart_rate_average",
  HKQuantityTypeIdentifierVO2Max: "vo2_max",
  HKQuantityTypeIdentifierStepCount: "step_count",
  HKQuantityTypeIdentifierActiveEnergyBurned: "active_energy",
  HKQuantityTypeIdentifierBodyMass: "weight_body_mass",
  HKQuantityTypeIdentifierOxygenSaturation: "oxygen_saturation",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratory_rate",
  HKQuantityTypeIdentifierAppleExerciseTime: "exercise_minutes",
  HKQuantityTypeIdentifierTimeInDaylight: "daylight_minutes",
  HKQuantityTypeIdentifierWalkingSpeed: "walking_speed",
  HKQuantityTypeIdentifierAppleWalkingSteadiness: "walking_steadiness",
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: "six_minute_walk_distance",
  HKQuantityTypeIdentifierRunningPower: "running_power",
  HKQuantityTypeIdentifierRunningStrideLength: "running_stride_length",
  HKQuantityTypeIdentifierRunningVerticalOscillation: "running_vertical_oscillation",
  HKQuantityTypeIdentifierRunningGroundContactTime: "running_ground_contact_time",
};

const COLUMN_OVERRIDES = { cardioRecovery1m: "cardio_recovery_1m" };
const snake = (name) => COLUMN_OVERRIDES[name] ?? name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const fields = Object.values(APPLE_TYPES).map((metric) => ({ metric, column: snake(HEALTH_METRIC_MAP[metric].column), aggregation: HEALTH_METRIC_MAP[metric].aggregation }));
const byMetric = new Map(fields.map((field) => [field.metric, field]));
const counts = Object.fromEntries(fields.map((field) => [field.column, 0]));
const days = new Map();

const unzip = spawn("unzip", ["-p", zipPath, "apple_health_export/export.xml"]);
const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.includes("<Record type=")) continue;
  const metric = APPLE_TYPES[line.match(/ type="([^"]+)"/)?.[1]];
  if (!metric) continue;
  const startDate = line.match(/ startDate="([^"]+)"/)?.[1];
  const raw = Number(line.match(/ value="([^"]+)"/)?.[1]);
  if (!startDate || !Number.isFinite(raw)) continue;
  const date = startDate.slice(0, 10);
  const unit = line.match(/ unit="([^"]*)"/)?.[1];
  const source = line.match(/ sourceName="([^"]*)"/)?.[1] ?? "?";
  const value = normalizeHealthMetricValue(metric, unit, raw);
  const { column } = byMetric.get(metric);
  const day = days.get(date) ?? { date, buckets: new Map() };
  const bucket = day.buckets.get(column) ?? { metric, sources: new Map(), lastAt: "", last: null };
  const entry = bucket.sources.get(source) ?? { sum: 0, count: 0 };
  entry.sum += value;
  entry.count += 1;
  bucket.sources.set(source, entry);
  if (startDate >= bucket.lastAt) { bucket.lastAt = startDate; bucket.last = value; }
  day.buckets.set(column, bucket);
  days.set(date, day);
  counts[column] += 1;
}

const unzipExit = await new Promise((resolve) => unzip.on("close", resolve));
if (unzipExit !== 0) throw new Error(`Apple Health-export kon niet worden gelezen (unzip ${unzipExit})`);

// Som: iPhone en Apple Watch registreren dezelfde stappen en energie. Neem per dag de bron met het hoogste totaal
// in plaats van alle bronnen op te tellen, anders raken dagtotalen dubbel geteld.
const rejected = Object.fromEntries(fields.map((field) => [field.column, 0]));
const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ date, buckets }) => {
  const row = { date };
  for (const [column, bucket] of buckets) {
    const { aggregation } = byMetric.get(bucket.metric);
    const perSource = [...bucket.sources.values()];
    const value = aggregation === "sum"
      ? Math.max(...perSource.map((entry) => entry.sum))
      : aggregation === "last"
        ? bucket.last
        : perSource.reduce((total, entry) => total + entry.sum, 0) / perSource.reduce((total, entry) => total + entry.count, 0);
    if (isValidHealthMetricValue(bucket.metric, value)) row[column] = value; else rejected[column] += 1;
  }
  return row;
});

const columns = fields.map((field) => field.column);
const sql = neon(process.env.DATABASE_URL);

if (dryRun) {
  const existing = await sql.query(`select date::text as date, ${columns.join(", ")} from health_metrics`);
  const byDate = new Map(existing.map((row) => [row.date, row]));
  const wouldFill = Object.fromEntries(columns.map((column) => [column, 0]));
  let newDays = 0;
  for (const row of rows) {
    const current = byDate.get(row.date);
    if (!current) newDays += 1;
    for (const column of columns) if (row[column] != null && current?.[column] == null) wouldFill[column] += 1;
  }
  console.log(JSON.stringify({ dryRun: true, daysInExport: rows.length, newDays, wouldFillPerColumn: wouldFill, rejectedOutOfRange: rejected }, null, 2));
  process.exit(0);
}

const typed = columns.map((column) => `${column} real`).join(", ");
const insertColumns = ["date", ...columns].join(", ");
const selectColumns = ["x.date::date", ...columns.map((column) => `x.${column}`)].join(", ");
const updates = columns.map((column) => `${column} = coalesce(health_metrics.${column}, excluded.${column})`).join(", ");
const statement = `insert into health_metrics (${insertColumns}) select ${selectColumns} from json_to_recordset($1::json) as x(date text, ${typed}) on conflict (date) do update set ${updates}`;

for (let index = 0; index < rows.length; index += 400) {
  await sql.query(statement, [JSON.stringify(rows.slice(index, index + 400))]);
}

console.log(JSON.stringify({ importedDays: rows.length, sourceRecords: counts, rejectedOutOfRange: rejected }, null, 2));
