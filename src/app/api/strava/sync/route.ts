import { NextResponse } from "next/server";
import { syncStravaRuns } from "@/lib/sync";
import { bearerToken, hasValidSharedSecret } from "@/lib/security";

async function handleSync(request: Request) {
  const cronSecret =
    request.headers.get("x-cron-secret") ?? bearerToken(request.headers.get("authorization"));
  if (!hasValidSharedSecret(cronSecret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncStravaRuns();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Strava sync failed" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}
