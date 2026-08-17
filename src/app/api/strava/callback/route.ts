import { NextResponse } from "next/server";
import { exchangeCodeForToken, saveTokens } from "@/lib/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const tokens = await exchangeCodeForToken(code);
  const athleteId = String(tokens.athlete?.id ?? "unknown");
  await saveTokens(athleteId, tokens);

  return NextResponse.redirect(new URL("/", url.origin));
}
