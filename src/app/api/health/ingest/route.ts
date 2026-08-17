import { NextResponse } from "next/server";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";

// Health Auto Export sends: { data: { metrics: [ { name, units, data: [ { date, qty }, ... ] }, ... ] } }
type HaeMetric = {
  name: string;
  data: Array<{ date: string; qty?: number; Avg?: number; value?: number }>;
};
type HaePayload = { data: { metrics: HaeMetric[] } };

const METRIC_MAP: Record<string, keyof typeof COLUMN_DEFAULTS> = {
  resting_heart_rate: "restingHeartRate",
  heart_rate_variability: "hrvMs",
  vo2_max: "vo2Max",
  sleep_analysis: "sleepHours",
  step_count: "steps",
  active_energy: "activeEnergyKcal",
  weight_body_mass: "weightKg",
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

function pointValue(p: { qty?: number; Avg?: number; value?: number }) {
  return p.qty ?? p.Avg ?? p.value ?? null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (secret !== process.env.HEALTH_INGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as HaePayload;
  const metrics = payload?.data?.metrics ?? [];

  const byDate = new Map<string, Partial<typeof COLUMN_DEFAULTS>>();

  for (const metric of metrics) {
    const column = METRIC_MAP[metric.name];
    if (!column) continue;
    for (const point of metric.data ?? []) {
      const key = dayKey(point.date);
      const value = pointValue(point);
      if (value === null) continue;
      const existing = byDate.get(key) ?? {};
      existing[column] = value;
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
