import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  hasValidSharedSecret,
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
