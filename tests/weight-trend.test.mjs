import assert from "node:assert/strict";
import test from "node:test";
import { smoothWeightPoints } from "../src/lib/weight-trend.ts";

test("seven-day trend dampens alternating daily weights at real measurement dates", () => {
  const points = [70, 74, 70, 74, 70, 74, 70].map((value, index) => ({ date: `2026-10-${String(index + 1).padStart(2, "0")}`, value }));
  const trend = smoothWeightPoints(points);
  assert.deepEqual(trend.map((point) => point.date), points.map((point) => point.date));
  assert.ok(trend[3].value < 73 && trend[3].value > 71);
  assert.equal(points[3].value, 74);
});

test("trend does not bridge long gaps or add a value on an unmeasured day", () => {
  const points = [
    { date: "2026-09-01", value: 70 },
    { date: "2026-09-02", value: null },
    { date: "2026-10-01", value: 72 },
    { date: "2026-10-20", value: 71 },
  ];
  assert.deepEqual(smoothWeightPoints(points), [
    { date: "2026-09-01", value: 70 },
    { date: "2026-10-01", value: 72 },
    { date: "2026-10-20", value: 71 },
  ]);
});
