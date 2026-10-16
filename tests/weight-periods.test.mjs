import assert from "node:assert/strict";
import test from "node:test";
import { buildWeightPeriods, latestWeight } from "../src/lib/weight-periods.ts";

function series(startDate, values) {
  const base = Date.parse(`${startDate}T12:00:00Z`);
  return values.map((value, index) => ({ date: new Date(base + index * 86_400_000).toISOString().slice(0, 10), value }));
}

test("recent weeks are compared with the longer period before them", () => {
  // 2026-10-15 minus 4 weeks = recent 2026-09-18..2026-10-15, previous 2026-07-24..2026-09-17
  const points = [
    ...series("2026-08-01", Array(30).fill(72)),
    ...series("2026-09-20", Array(20).fill(70)),
  ];
  const result = buildWeightPeriods(points, "2026-10-15", 4);
  assert.equal(result.direction, "lower");
  assert.equal(result.recent.start, "2026-09-18");
  assert.equal(result.previous.end, "2026-09-17");
  assert.ok(Math.abs(result.deltaKg + 2) < 1e-9);
  assert.match(result.summary, /lager geworden/);
});

test("small differences count as stable", () => {
  const points = [...series("2026-08-01", Array(30).fill(70.1)), ...series("2026-09-20", Array(20).fill(70))];
  const result = buildWeightPeriods(points, "2026-10-15", 4);
  assert.equal(result.direction, "stable");
});

test("a period with fewer than three measurements gets no average", () => {
  const points = [...series("2026-08-01", Array(30).fill(72)), ...series("2026-10-10", [70, 70])];
  const result = buildWeightPeriods(points, "2026-10-15", 4);
  assert.equal(result.recent, null);
  assert.equal(result.deltaKg, null);
  assert.match(result.summary, /te weinig/);
});

test("missing comparison period is reported without a delta", () => {
  const result = buildWeightPeriods(series("2026-09-25", Array(15).fill(70)), "2026-10-15", 4);
  assert.ok(result.recent);
  assert.equal(result.previous, null);
  assert.equal(result.direction, null);
});

test("null values are ignored and latestWeight picks the newest measurement", () => {
  const points = [{ date: "2026-10-13", value: 70.2 }, { date: "2026-10-14", value: null }, { date: "2026-10-12", value: 71 }];
  assert.deepEqual(latestWeight(points), { date: "2026-10-13", value: 70.2 });
  assert.equal(latestWeight([]), null);
});
