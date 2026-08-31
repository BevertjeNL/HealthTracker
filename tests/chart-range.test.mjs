import assert from "node:assert/strict";
import test from "node:test";
import { buildChartTicks, chartSpanDays, formatChartTick, summarizeChartPoints } from "../src/lib/chart-range.ts";

test("uses calendar dates for short ranges and years for multi-year ranges", () => {
  const shortDomain = ["2026-08-02", "2026-08-31"];
  const longDomain = ["2024-02-03", "2026-08-31"];
  assert.equal(chartSpanDays(shortDomain), 29);
  assert.match(formatChartTick(buildChartTicks(shortDomain)[0], 29), /aug/);
  assert.deepEqual(buildChartTicks(longDomain).map((tick) => formatChartTick(tick, chartSpanDays(longDomain))), ["2024", "2025", "2026"]);
});

test("summary only reflects the points passed for the selected range", () => {
  const summary = summarizeChartPoints([
    { date: "2026-08-01", value: 71.2 },
    { date: "2026-08-20", value: 70.8 },
    { date: "2026-08-31", value: 70.5 },
  ]);
  assert.equal(summary.first, 71.2);
  assert.equal(summary.latest, 70.5);
  assert.equal(summary.minimum, 70.5);
  assert.equal(summary.maximum, 71.2);
  assert.ok(Math.abs(summary.average - 70.8333333333) < 0.0001);
});
