import { SignJWT, jwtVerify } from "jose";
import { safeEqual } from "@/lib/security";

export const SESSION_COOKIE = "healthtracker_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export function isAuthConfigured() {
  return Boolean(
    process.env.APP_PASSWORD &&
      process.env.APP_PASSWORD.length >= 16 &&
      sessionKey(),
  );
}

export function verifyAppPassword(password: string) {
  if (!isAuthConfigured()) return false;
  return safeEqual(password, process.env.APP_PASSWORD);
}

export async function createSessionToken() {
  const key = sessionKey();
  if (!key) throw new Error("Authentication is not configured");

  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(token: string | null | undefined) {
  const key = sessionKey();
  if (!key || !token) return false;

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.authenticated === true;
  } catch {
    return false;
  }
}
