import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { lt, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function sourceHash(header: string | null) {
  // Vercel overwrites X-Forwarded-For before forwarding a request to the app.
  // Missing or malformed addresses share a conservative fallback bucket.
  const address = header?.split(",", 1)[0]?.trim();
  const source = address && isIP(address) ? address : "unknown";
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update(`login:${source}`)
    .digest("hex");
}

export async function reserveLoginAttempt() {
  const requestHeaders = await headers();
  const key = sourceHash(requestHeaders.get("x-forwarded-for"));
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);

  // One atomic upsert ensures concurrent requests cannot all read the same
  // pre-increment counter. The caller checks the returned count before login.
  const [record] = await db.insert(loginAttempts)
    .values({ sourceHash: key, attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.sourceHash,
      set: {
        attempts: sql`CASE WHEN ${loginAttempts.windowStartedAt} < ${windowCutoff} THEN 1 ELSE ${loginAttempts.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${loginAttempts.windowStartedAt} < ${windowCutoff} THEN ${now} ELSE ${loginAttempts.windowStartedAt} END`,
      },
    })
    .returning({ attempts: loginAttempts.attempts });

  // Indexed cleanup keeps the table bounded without storing a raw address.
  await db.delete(loginAttempts).where(lt(loginAttempts.windowStartedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));

  return { allowed: record.attempts <= MAX_ATTEMPTS, key };
}

export async function clearLoginAttempts(key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.sourceHash, key));
}
