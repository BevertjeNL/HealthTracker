import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = [
  "/api/health/ingest",
  "/api/strava/callback",
  "/api/strava/sync",
];

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function pageResponse(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return noStore(response);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return authenticated
      ? noStore(NextResponse.redirect(new URL("/", request.url)))
      : pageResponse(request);
  }

  if (PUBLIC_PATHS.includes(pathname)) return noStore(NextResponse.next());
  if (authenticated) {
    return pathname.startsWith("/api/")
      ? noStore(NextResponse.next())
      : pageResponse(request);
  }

  if (pathname.startsWith("/api/")) {
    return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  return noStore(NextResponse.redirect(new URL("/login", request.url)));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)"],
};
