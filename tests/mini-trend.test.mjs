import assert from "node:assert/strict";
import test from "node:test";
import { buildMiniTrend } from "../src/lib/mini-trend.ts";

test("excludes old samples instead of presenting them as recent", () => {
  const trend = buildMiniTrend([
    { date: "2025-01-01", value: 30 },
    { date: "2026-08-20", value: 40 },
    { date: "2026-08-31", value: 44 },
  ], { endDate: "2026-08-31", windowDays: 42 });

  assert.deepEqual(trend.points.map((point) => point.value), [40, 44]);
  assert.equal(trend.sampleCount, 2);
  assert.equal(trend.change, 4);
});

test("aggregates dense measurements into calm calendar-week averages", () => {
  const trend = buildMiniTrend([
    { date: "2026-08-18", value: 30 },
    { date: "2026-08-19", value: 40 },
    { date: "2026-08-26", value: 50 },
    { date: "2026-08-27", value: 60 },
  ], { endDate: "2026-08-31", windowDays: 14, bucketDays: 7 });

  assert.deepEqual(trend.points.map((point) => point.value), [35, 55]);
  assert.equal(trend.change, 20);
});

test("keeps zero-distance weeks visible in a weekly load trend", () => {
  const trend = buildMiniTrend([
    { date: "2026-08-20", value: 7.5 },
    { date: "2026-08-29", value: 10 },
  ], {
    endDate: "2026-08-31",
    windowDays: 28,
    bucketDays: 7,
    aggregation: "sum",
    includeEmptyBuckets: true,
  });

  assert.equal(trend.points.length, 4);
  assert.deepEqual(trend.points.map((point) => point.value), [0, 0, 7.5, 10]);
});
