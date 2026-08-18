import { db } from "@/db";
import { stravaTokens } from "@/db/schema";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
};

export async function exchangeCodeForToken(code: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed with status ${res.status}`);
  return (await res.json()) as StravaTokenResponse;
}

async function refreshToken(refreshToken: string) {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed with status ${res.status}`);
  return (await res.json()) as StravaTokenResponse;
}

export async function saveTokens(athleteId: string, tokens: StravaTokenResponse) {
  const values = {
    athleteId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expires_at * 1000),
    updatedAt: new Date(),
  };
  await db
    .insert(stravaTokens)
    .values(values)
    .onConflictDoUpdate({ target: stravaTokens.athleteId, set: values });
}

export async function getValidAccessToken(): Promise<string> {
  const [row] = await db.select().from(stravaTokens).limit(1);
  if (!row) throw new Error("No Strava tokens stored yet — connect via /api/strava/auth first");

  if (row.expiresAt.getTime() > Date.now() + 60_000) {
    return row.accessToken;
  }

  const fresh = await refreshToken(row.refreshToken);
  await saveTokens(row.athleteId, fresh);
  return fresh.access_token;
}
