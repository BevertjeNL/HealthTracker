import assert from "node:assert/strict";
import test from "node:test";
import { buildInsights } from "../src/lib/insights.ts";

function run(daysAgo, distanceKm, pace = 6, heartRate = 145) {
  const now = new Date("2026-08-27T12:00:00Z");
  return {
    startDate: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
    distanceM: distanceKm * 1000,
    avgPaceMinPerKm: pace,
    avgHeartRate: heartRate,
  };
}

test("flags stale Health data and does not depend on sleep", () => {
  const insights = buildInsights(
    [run(2, 5)],
    [{ date: "2026-08-20", hrvMs: 40, restingHeartRate: 60 }],
    new Date("2026-08-27T12:00:00Z"),
  );

  assert.equal(insights[0].id, "health-sync-stale");
  assert.match(insights[0].recommendation, /automatisering/i);
  assert.equal(insights.some((insight) => insight.id.includes("sleep")), false);
});

test("treats a recent zero HRV row as invalid instead of fresh recovery data", () => {
  const metrics = [
    { date: "2026-08-20", hrvMs: 40, restingHeartRate: 60 },
    { date: "2026-08-21", hrvMs: 41, restingHeartRate: 61 },
    { date: "2026-08-22", hrvMs: 39, restingHeartRate: 60 },
    { date: "2026-08-23", hrvMs: 42, restingHeartRate: 59 },
    { date: "2026-08-24", hrvMs: 40, restingHeartRate: 60 },
    { date: "2026-08-26", hrvMs: 38, restingHeartRate: 67 },
    { date: "2026-08-29", hrvMs: 0, restingHeartRate: null },
  ];
  const insights = buildInsights([], metrics, new Date("2026-08-30T12:00:00Z"));

  assert.equal(insights[0].id, "health-sync-stale");
  assert.equal(insights.some((insight) => insight.id === "recovery-baseline"), false);
});

test("warns when seven-day running volume rises more than thirty percent", () => {
  const insights = buildInsights(
    [run(2, 8), run(5, 7), run(9, 5), run(12, 5)],
    [],
    new Date("2026-08-27T12:00:00Z"),
  );
  const load = insights.find((insight) => insight.id === "training-load");

  assert.ok(load);
  assert.equal(load.status, "warning");
  assert.match(load.title, /stijgt snel/i);
});

test("reports improved aerobic efficiency over comparable run blocks", () => {
  const runs = [
    run(24, 5, 6.2, 150), run(21, 5, 6.1, 150), run(18, 5, 6.2, 149), run(15, 5, 6.1, 149),
    run(12, 5, 5.8, 148), run(9, 5, 5.7, 147), run(6, 5, 5.8, 147), run(3, 5, 5.7, 146),
  ];
  const insights = buildInsights(runs, [], new Date("2026-08-27T12:00:00Z"));
  const efficiency = insights.find((insight) => insight.id === "aerobic-efficiency");

  assert.ok(efficiency);
  assert.equal(efficiency.status, "good");
});
