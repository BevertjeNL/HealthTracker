import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidHealthPayloadError,
  normalizeHealthMetricValue,
  parseHealthPayload,
} from "../src/lib/health-import.ts";

test("converts Health Auto Export active energy from kJ to kcal", () => {
  assert.ok(Math.abs(normalizeHealthMetricValue("active_energy", "kJ", 418.4) - 100) < 0.001);
  assert.equal(normalizeHealthMetricValue("active_energy", "kcal", 100), 100);
});

test("normalizes both Health Auto Export weight metric names", () => {
  const pounds = 154.324;
  assert.ok(Math.abs(normalizeHealthMetricValue("weight_&_body_mass", "lb", pounds) - 70) < 0.01);
  assert.equal(normalizeHealthMetricValue("weight_body_mass", "kg", 70), 70);
});

test("parses a flat Apple Shortcuts daily payload", () => {
  const parsed = parseHealthPayload({
    source: "apple-shortcuts",
    date: "2026-08-26",
    heart_rate_variability: "48.5 ms",
    resting_heart_rate: "52,4",
    step_count: 12345,
    active_energy: 640,
    unsupported_metric: 10,
    weight_body_mass: "",
  });

  assert.equal(parsed.source, "apple-shortcuts");
  assert.deepEqual(parsed.rows, [{
    date: "2026-08-26",
    values: {
      hrvMs: 48.5,
      restingHeartRate: 52.4,
      steps: 12345,
      activeEnergyKcal: 640,
    },
  }]);
  assert.deepEqual(parsed.ignoredMetrics, ["unsupported_metric"]);
});

test("rejects an invalid Apple Shortcuts calendar date", () => {
  assert.throws(
    () => parseHealthPayload({ source: "apple-shortcuts", date: "2026-02-30", step_count: 1 }),
    InvalidHealthPayloadError,
  );
});

test("keeps Health Auto Export aggregation compatible", () => {
  const parsed = parseHealthPayload({
    data: {
      metrics: [
        {
          name: "heart_rate_variability",
          units: "ms",
          data: [
            { date: "2026-08-26 08:00:00 +0200", qty: 40 },
            { date: "2026-08-26 09:00:00 +0200", qty: 50 },
          ],
        },
        {
          name: "active_energy",
          units: "kJ",
          data: [
            { date: "2026-08-26 08:00:00 +0200", qty: 209.2 },
            { date: "2026-08-26 09:00:00 +0200", qty: 209.2 },
          ],
        },
      ],
    },
  });

  assert.equal(parsed.source, "health-auto-export");
  assert.equal(parsed.rows[0].date, "2026-08-26");
  assert.equal(parsed.rows[0].values.hrvMs, 45);
  assert.ok(Math.abs(parsed.rows[0].values.activeEnergyKcal - 100) < 0.001);
});
