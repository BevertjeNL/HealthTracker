import { createHash, timingSafeEqual } from "node:crypto";

export function safeEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;

  const leftBuffer = createHash("sha256").update(left).digest();
  const rightBuffer = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function bearerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length) || null;
}

export function hasValidSharedSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
) {
  return safeEqual(provided, expected);
}
