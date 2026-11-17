import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  hasValidSharedSecret,
  InvalidJsonBodyError,
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
  safeEqual,
} from "../src/lib/security.ts";

test("shared secrets fail closed when either side is missing", () => {
  assert.equal(hasValidSharedSecret(undefined, undefined), false);
  assert.equal(hasValidSharedSecret(null, "configured"), false);
  assert.equal(hasValidSharedSecret("provided", undefined), false);
});

test("shared secrets only accept an exact match", () => {
  assert.equal(hasValidSharedSecret("correct-secret", "correct-secret"), true);
  assert.equal(hasValidSharedSecret("correct-secret", "wrong-secret"), false);
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("short", "a-longer-value"), false);
});

test("bearer tokens require the exact scheme", () => {
  assert.equal(bearerToken("Bearer cron-secret"), "cron-secret");
  assert.equal(bearerToken("Basic cron-secret"), null);
  assert.equal(bearerToken("cron-secret"), null);
  assert.equal(bearerToken("Bearer "), null);
});

test("JSON request size is enforced even when Content-Length is missing", async () => {
  const request = new Request("https://example.test/api/health/ingest", {
    method: "POST",
    body: JSON.stringify({ values: "x".repeat(200) }),
  });
  await assert.rejects(readJsonBodyWithLimit(request, 64), RequestBodyTooLargeError);
});

test("JSON reader rejects malformed input and accepts a bounded payload", async () => {
  const valid = new Request("https://example.test", { method: "POST", body: '{"ok":true}' });
  assert.deepEqual(await readJsonBodyWithLimit(valid, 64), { ok: true });

  const invalid = new Request("https://example.test", { method: "POST", body: "{" });
  await assert.rejects(readJsonBodyWithLimit(invalid, 64), InvalidJsonBodyError);
});
