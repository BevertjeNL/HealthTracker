import { NextResponse } from "next/server";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";
import { hasValidSharedSecret } from "@/lib/security";
import { normalizeHealthMetricValue } from "@/lib/health-import";

// Health Auto Export sends: { data: { metrics: [ { name, units, data: [ { date, qty|Avg|value }, ... ] }, ... ] } }
// Each metric can contain many points per day (e.g. one per hour), so we need
// to aggregate per calendar day ourselves — Health Auto Export does not do
// this for us even with "aggregate data" enabled.
type HaePoint = {
  date: string;
  qty?: number;
  Avg?: number;
  value?: number;
};
type HaeMetric = { name: string; units?: string; data: HaePoint[] };
type HaePayload = { data: { metrics: HaeMetric[] } };

type MetricValues = {
  restingHeartRate: number | null;
  hrvMs: number | null;
  cardioRecovery1m: number | null;
  walkingHeartRateAverage: number | null;
  vo2Max: number | null;
  steps: number | null;
  activeEnergyKcal: number | null;
  weightKg: number | null;
};
type Column = keyof MetricValues;
type Agg = "sum" | "avg" | "last";

const METRIC_MAP: Record<string, { column: Column; agg: Agg }> = {
  resting_heart_rate: { column: "restingHeartRate", agg: "avg" },
  heart_rate_variability: { column: "hrvMs", agg: "avg" },
  cardio_recovery: { column: "cardioRecovery1m", agg: "avg" },
  heart_rate_recovery_one_minute: { column: "cardioRecovery1m", agg: "avg" },
  walking_heart_rate_average: { column: "walkingHeartRateAverage", agg: "avg" },
  vo2_max: { column: "vo2Max", agg: "last" },
  step_count: { column: "steps", agg: "sum" },
  active_energy: { column: "activeEnergyKcal", agg: "sum" },
  weight_body_mass: { column: "weightKg", agg: "last" },
  "weight_&_body_mass": { column: "weightKg", agg: "last" },
};

function dayKey(dateStr: string) {
  return dateStr.slice(0, 10);
}

function pointValue(p: HaePoint) {
  return p.qty ?? p.Avg ?? p.value ?? null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (!hasValidSharedSecret(secret, process.env.HEALTH_INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: HaePayload;
  try {
    payload = (await request.json()) as HaePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  const metrics = payload?.data?.metrics ?? [];
  const receivedMetrics = [...new Set(metrics.map((metric) => metric.name))].sort();
  const importedMetrics = receivedMetrics.filter((name) => name in METRIC_MAP);
  const ignoredMetrics = receivedMetrics.filter((name) => !(name in METRIC_MAP));

  // date -> column -> chronologically ordered values for that day
  const buckets = new Map<string, Partial<Record<Column, number[]>>>();

  for (const metric of metrics) {
    const mapping = METRIC_MAP[metric.name];
    if (!mapping) continue;

    const points = [...(metric.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    for (const point of points) {
      const value = pointValue(point);
      if (value === null || !Number.isFinite(value)) continue;
      const key = dayKey(point.date);
      const dayBucket = buckets.get(key) ?? {};
      const values = dayBucket[mapping.column] ?? [];
      values.push(normalizeHealthMetricValue(metric.name, metric.units, value));
      dayBucket[mapping.column] = values;
      buckets.set(key, dayBucket);
    }
  }

  function reduce(values: number[], agg: Agg) {
    if (agg === "sum") return values.reduce((a, b) => a + b, 0);
    if (agg === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
    return values[values.length - 1]; // last (chronologically)
  }

  let upserted = 0;
  for (const [date, dayBucket] of buckets) {
    const values: Partial<MetricValues> = {};
    for (const mapping of Object.values(METRIC_MAP)) {
      const arr = dayBucket[mapping.column];
      if (arr && arr.length > 0) {
        values[mapping.column] = reduce(arr, mapping.agg);
      }
    }
    if (Object.keys(values).length === 0) continue;

    await db
      .insert(healthMetrics)
      .values({ date, ...values })
      .onConflictDoUpdate({
        target: healthMetrics.date,
        set: values,
      });
    upserted++;
  }

  return NextResponse.json({ upserted, receivedMetrics, importedMetrics, ignoredMetrics });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST Health Auto Export payloads here",
    acceptedMetrics: Object.keys(METRIC_MAP).sort(),
    recommendedMetrics: [
      "heart_rate_variability",
      "resting_heart_rate",
      "cardio_recovery",
      "walking_heart_rate_average",
      "vo2_max",
      "step_count",
      "active_energy",
      "weight_&_body_mass",
    ],
  });
}
