import assert from "node:assert/strict";
import test from "node:test";
import { buildChartTicks, chartSpanDays, formatChartTick, manualValueDomain, selectChartWindow, summarizeChartPoints } from "../src/lib/chart-range.ts";

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

test("manual chart axes crop dates and accept independent Y limits", () => {
  const points = [
    { date: "2026-08-01", value: 71.2 },
    { date: "2026-08-20", value: 70.8 },
    { date: "2026-08-31", value: 70.5 },
  ];
  const visible = selectChartWindow(points, "2026-08-20", "2026-08-31");
  assert.equal(visible.length, 2);
  assert.deepEqual(manualValueDomain(visible, "69", "72").domain, [69, 72]);
  assert.equal(manualValueDomain(visible, "70", "").domain[0], 70);
  assert.match(manualValueDomain(visible, "72", "69").error, /ondergrens/);
  assert.equal(selectChartWindow(points, "2026-09-01", "2026-08-31"), null);
});

test("saved chart settings survive a round trip and reject malformed input", async () => {
  const { parseChartSettings, DEFAULT_CHART_SETTINGS } = await import("../src/lib/chart-range.ts");
  const saved = { preset: null, start: "2026-08-01", end: "2026-09-30", lower: 70, upper: 75 };
  assert.deepEqual(parseChartSettings(JSON.stringify(saved)), saved);
  assert.deepEqual(parseChartSettings("not json"), DEFAULT_CHART_SETTINGS);
  assert.deepEqual(parseChartSettings(null), DEFAULT_CHART_SETTINGS);
  assert.equal(parseChartSettings(JSON.stringify({ preset: 90, lower: 80, upper: 70 })).lower, null);
  assert.equal(parseChartSettings(JSON.stringify({ preset: 7 })).preset, "all");
});

test("chart window follows presets relative to today and stays inside the data range", async () => {
  const { resolveChartWindow } = await import("../src/lib/chart-range.ts");
  assert.deepEqual(resolveChartWindow({ preset: 30, start: null, end: null, lower: null, upper: null }, "2026-01-01", "2026-10-11"), ["2026-09-12", "2026-10-11"]);
  assert.deepEqual(resolveChartWindow({ preset: "all", start: null, end: null, lower: null, upper: null }, "2026-01-01", "2026-10-11"), ["2026-01-01", "2026-10-11"]);
  assert.deepEqual(resolveChartWindow({ preset: null, start: "2025-01-01", end: "2027-01-01", lower: null, upper: null }, "2026-01-01", "2026-10-11"), ["2026-01-01", "2026-10-11"]);
  const [start, end] = resolveChartWindow({ preset: null, start: "2026-05-01", end: "2026-05-02", lower: null, upper: null }, "2026-01-01", "2026-10-11");
  assert.ok(start < end);
});
