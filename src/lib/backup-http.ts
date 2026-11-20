import { createHmac } from "node:crypto";
import { clearLoginAttempts, reserveLoginAttempt } from "@/lib/login-throttle";
import { safeEqual } from "@/lib/security";
import { verifyAppPassword } from "@/lib/session";
import { hasAuthenticatedSession } from "@/lib/session-server";

export const BACKUP_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
export const BACKUP_MAX_FILE_BYTES = 3_500_000;
const FLOW_TOKEN_MS = 15 * 60 * 1000;

export const backupHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function backupError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: backupHeaders });
}

export async function requireBackupAccess(request: Request): Promise<Response | null> {
  if (!(await hasAuthenticatedSession())) return backupError("Log opnieuw in.", 401);
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return backupError("Ongeldige aanvraag.", 403);
    }
  } catch {
    return backupError("Ongeldige aanvraag.", 403);
  }
  return null;
}

/** A fresh app-password check protects the complete export and destructive restore. */
export async function requireBackupPassword(value: unknown): Promise<Response | null> {
  let attempt;
  try {
    attempt = await reserveLoginAttempt();
  } catch {
    return backupError("Back-up is tijdelijk niet beschikbaar.", 503);
  }
  if (!attempt.allowed) return backupError("Te veel pogingen. Probeer het over 15 minuten opnieuw.", 429);
  if (typeof value !== "string" || value.length > 512 || !verifyAppPassword(value)) {
    return backupError("Onjuist app-wachtwoord.", 403);
  }
  await clearLoginAttempts(attempt.key);
  return null;
}

type TokenPurpose = "inspect" | "safety";

export function signBackupFlowToken(purpose: TokenPurpose, digest: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session secret is not configured");
  const expires = String(Date.now() + FLOW_TOKEN_MS);
  const message = `${purpose}.${expires}.${digest}`;
  const signature = createHmac("sha256", secret).update(message).digest("base64url");
  return `${message}.${signature}`;
}

export function verifyBackupFlowToken(token: unknown, purpose: TokenPurpose, digest?: string): boolean {
  if (typeof token !== "string" || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== purpose) return false;
  const [label, expires, tokenDigest, signature] = parts;
  if (!/^\d{13}$/.test(expires) || !/^[a-f0-9]{64}$/.test(tokenDigest) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  if (Number(expires) < Date.now() || Number(expires) > Date.now() + FLOW_TOKEN_MS) return false;
  if (digest && tokenDigest !== digest) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${label}.${expires}.${tokenDigest}`).digest("base64url");
  return safeEqual(signature, expected);
}

export function verifiedBackupFlowDigest(token: unknown, purpose: TokenPurpose): string | null {
  return verifyBackupFlowToken(token, purpose) ? (token as string).split(".")[2] : null;
}
