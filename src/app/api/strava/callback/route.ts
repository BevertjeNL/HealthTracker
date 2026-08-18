import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken, saveTokens } from "@/lib/strava";
import { safeEqual } from "@/lib/security";
import { hasAuthenticatedSession } from "@/lib/session-server";

const STRAVA_OAUTH_STATE_COOKIE = "strava_oauth_state";

export async function GET(request: Request) {
  if (!(await hasAuthenticatedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STRAVA_OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(STRAVA_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/strava/callback",
    maxAge: 0,
  });

  if (!safeEqual(state, expectedState)) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  if (error) {
    return NextResponse.json({ error: "Strava authorization was cancelled" }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    if (!tokens.athlete?.id) {
      return NextResponse.json({ error: "Strava did not return an athlete" }, { status: 502 });
    }
    await saveTokens(String(tokens.athlete.id), tokens);
  } catch {
    return NextResponse.json({ error: "Strava authorization failed" }, { status: 502 });
  }

  return NextResponse.redirect(new URL("/", url.origin));
}
