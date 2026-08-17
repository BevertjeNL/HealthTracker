import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/strava/callback`;

  const authUrl = new URL("https://www.strava.com/oauth/authorize");
  authUrl.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("approval_prompt", "auto");
  authUrl.searchParams.set("scope", "read,activity:read_all");

  return NextResponse.redirect(authUrl.toString());
}
