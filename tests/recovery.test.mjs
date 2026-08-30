import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecoverySummary,
  isUsableRecoveryValue,
  latestRecoverySignal,
} from "../src/lib/recovery.ts";

test("rejects a zero HRV value", () => {
  assert.equal(isUsableRecoveryValue("hrvMs", 0), false);
  assert.equal(isUsableRecoveryValue("hrvMs", 42), true);
});

test("uses the latest valid value for each metric independently", () => {
  const rows = [
    { date: "2026-08-27", hrvMs: 38, restingHeartRate: 67 },
    { date: "2026-08-29", hrvMs: 0, restingHeartRate: null },
  ];

  assert.equal(latestRecoverySignal(rows, "hrvMs", "2026-08-30")?.value, 38);
  assert.equal(latestRecoverySignal(rows, "restingHeartRate", "2026-08-30")?.value, 67);
});

test("does not manufacture a readiness score from incomplete recovery data", () => {
  const rows = [
    { date: "2026-08-20", hrvMs: 40, restingHeartRate: 60 },
    { date: "2026-08-21", hrvMs: 41, restingHeartRate: 61 },
    { date: "2026-08-22", hrvMs: 39, restingHeartRate: 60 },
    { date: "2026-08-23", hrvMs: 42, restingHeartRate: 59 },
    { date: "2026-08-24", hrvMs: 40, restingHeartRate: 60 },
    { date: "2026-08-29", hrvMs: 0, restingHeartRate: null },
  ];

  const summary = buildRecoverySummary(rows, "2026-08-30", 82);
  assert.equal(summary.score, null);
  assert.equal(summary.confidence, "onvoldoende");
});

test("creates a score only when at least two fresh recovery signals have a baseline", () => {
  const rows = [20, 21, 22, 23, 24].map((day, index) => ({
    date: `2026-08-${day}`,
    hrvMs: 38 + index,
    restingHeartRate: 62 - index,
  }));
  rows.push({ date: "2026-08-29", hrvMs: 44, restingHeartRate: 57 });

  const summary = buildRecoverySummary(rows, "2026-08-30", 82);
  assert.equal(typeof summary.score, "number");
  assert.equal(summary.confidence, "middel");
});
