import { NextResponse } from "next/server";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";
import {
  HEALTH_METRIC_MAP,
  InvalidHealthPayloadError,
  parseHealthPayload,
  RECOMMENDED_HEALTH_METRICS,
} from "@/lib/health-import";
import { hasValidSharedSecret } from "@/lib/security";

export async function POST(request: Request) {
  const secret = request.headers.get("x-ingest-secret");
  if (!hasValidSharedSecret(secret, process.env.HEALTH_INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseHealthPayload(payload);
  } catch (error) {
    if (error instanceof InvalidHealthPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  let upserted = 0;
  for (const { date, values } of parsed.rows) {
    await db
      .insert(healthMetrics)
      .values({ date, ...values })
      .onConflictDoUpdate({
        target: healthMetrics.date,
        set: values,
      });
    upserted++;
  }

  return NextResponse.json({
    upserted,
    source: parsed.source,
    receivedMetrics: parsed.receivedMetrics,
    importedMetrics: parsed.importedMetrics,
    ignoredMetrics: parsed.ignoredMetrics,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST Apple Shortcuts or Health Auto Export payloads here",
    formats: {
      appleShortcuts: {
        required: ["source", "date"],
        source: "apple-shortcuts",
        dateFormat: "YYYY-MM-DD",
        metricFields: RECOMMENDED_HEALTH_METRICS,
        units: {
          heart_rate_variability: "ms",
          resting_heart_rate: "bpm",
          cardio_recovery: "bpm",
          walking_heart_rate_average: "bpm",
          vo2_max: "mL/kg/min",
          step_count: "count",
          active_energy: "kcal",
          weight_body_mass: "kg",
        },
      },
      healthAutoExport: { supported: true },
    },
    acceptedMetrics: Object.keys(HEALTH_METRIC_MAP).sort(),
    recommendedMetrics: RECOMMENDED_HEALTH_METRICS,
  });
}
