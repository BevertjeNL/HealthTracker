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

export class RequestBodyTooLargeError extends Error {}
export class InvalidJsonBodyError extends Error {}

export async function readJsonBodyWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError("Request body is too large");
  }
  if (!request.body) throw new InvalidJsonBodyError("Invalid JSON payload");

  const chunks: Uint8Array[] = [];
  const reader = request.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError("Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidJsonBodyError("Invalid JSON payload");
  }
}
