import { NextResponse } from "next/server";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";

// Health Auto Export sends: { data: { metrics: [ { name, units, data: [ { date, qty|Avg|Sum|Min|Max }, ... ] }, ... ] } }
type HaePoint = {
  date: string;
  qty?: number;
  Avg?: number;
  Sum?: number;
  Min?: number;
  Max?: number;
  value?: number;
};
type HaeMetric = { name: string; data: HaePoint[] };
type HaePayload = { data: { metrics: HaeMetric[] } };

type Column = keyof typeof COLUMN_DEFAULTS;

// Cumulative metrics (steps, active energy) need the daily Sum when the export
// is aggregated; rate/level metrics (heart rate, HRV, weight) need the Avg.
const METRIC_MAP: Record<string, { column: Column; preferSum: boolean }> = {
  resting_heart_rate: { column: "restingHeartRate", preferSum: false },
  heart_rate_variability: { column: "hrvMs", preferSum: false },
  vo2_max: { column: "vo2Max", preferSum: false },
  sleep_analysis: { column: "sleepHours", preferSum: true },
  step_count: { column: "steps", preferSum: true },
  active_energy: { column: "activeEnergyKcal", preferSum: true },
  weight_body_mass: { column: "weightKg", preferSum: false },
};

const COLUMN_DEFAULTS = {
  restingHeartRate: null as number | null,
  hrvMs: null as number | null,
  vo2Max: null as number | null,
  sleepHours: null as number | null,
  steps: null as number | null,
  activeEnergyKcal: null as number | null,
  weightKg: null as number | null,
};

function dayKey(dateStr: string) {
  return dateStr.slice(0, 10);
}

function pointValue(p: HaePoint, preferSum: boolean) {
  if (preferSum) return p.Sum ?? p.qty ?? p.value ?? p.Avg ?? null;
  return p.Avg ?? p.qty ?? p.value ?? p.Sum ?? null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (secret !== process.env.HEALTH_INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as HaePayload;
  const metrics = payload?.data?.metrics ?? [];

  console.log(
    "health/ingest received metrics:",
    JSON.stringify(metrics.map((m) => ({ name: m.name, sample: m.data?.[0] }))),
  );

  const byDate = new Map<string, Partial<typeof COLUMN_DEFAULTS>>();

  for (const metric of metrics) {
    const mapping = METRIC_MAP[metric.name];
    if (!mapping) continue;
    for (const point of metric.data ?? []) {
      const key = dayKey(point.date);
      const value = pointValue(point, mapping.preferSum);
      if (value === null) continue;
      const existing = byDate.get(key) ?? {};
      existing[mapping.column] = value;
      byDate.set(key, existing);
    }
  }

  let upserted = 0;
  for (const [date, values] of byDate) {
    await db
      .insert(healthMetrics)
      .values({ date, ...values })
      .onConflictDoUpdate({
        target: healthMetrics.date,
        set: values,
      });
    upserted++;
  }

  return NextResponse.json({ upserted });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST Health Auto Export payloads here" });
}
