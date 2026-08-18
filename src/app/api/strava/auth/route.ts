import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hasAuthenticatedSession } from "@/lib/session-server";

export const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

export async function GET(request: Request) {
  if (!(await hasAuthenticatedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Strava is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/strava/callback`;
  const state = randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/strava/callback",
    maxAge: 10 * 60,
  });

  const authUrl = new URL("https://www.strava.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("approval_prompt", "auto");
  authUrl.searchParams.set("scope", "read,activity:read_all");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
