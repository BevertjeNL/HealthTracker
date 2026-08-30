import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidHealthPayloadError,
  normalizeHealthMetricValue,
  isValidHealthMetricValue,
  parseHealthPayload,
} from "../src/lib/health-import.ts";

test("converts Health Auto Export active energy from kJ to kcal", () => {
  assert.ok(Math.abs(normalizeHealthMetricValue("active_energy", "kJ", 418.4) - 100) < 0.001);
  assert.equal(normalizeHealthMetricValue("active_energy", "kcal", 100), 100);
});

test("rejects impossible recovery values", () => {
  assert.equal(isValidHealthMetricValue("heart_rate_variability", 0), false);
  assert.equal(isValidHealthMetricValue("resting_heart_rate", 0), false);
  assert.equal(isValidHealthMetricValue("heart_rate_variability", 42), true);

  const parsed = parseHealthPayload({
    source: "apple-shortcuts",
    date: "2026-08-29",
    heart_rate_variability: 0,
    resting_heart_rate: 0,
    step_count: 4617,
  });
  assert.deepEqual(parsed.rows[0].values, { steps: 4617 });
});

test("normalizes both Health Auto Export weight metric names", () => {
  const pounds = 154.324;
  assert.ok(Math.abs(normalizeHealthMetricValue("weight_&_body_mass", "lb", pounds) - 70) < 0.01);
  assert.equal(normalizeHealthMetricValue("weight_body_mass", "kg", 70), 70);
});

test("normalizes Apple fractional percentage metrics", () => {
  assert.equal(normalizeHealthMetricValue("oxygen_saturation", "%", 0.975), 97.5);
  assert.equal(normalizeHealthMetricValue("oxygen_saturation", undefined, 0.98), 98);
  assert.equal(normalizeHealthMetricValue("walking_steadiness", "%", 0.91), 91);
  assert.equal(normalizeHealthMetricValue("oxygen_saturation", "%", 98), 98);
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

test("parses long-term mobility and running metrics", () => {
  const parsed = parseHealthPayload({
    data: {
      metrics: [
        { name: "oxygen_saturation", units: "%", data: [{ date: "2026-08-26", qty: 0.98 }] },
        { name: "exercise_minutes", units: "min", data: [
          { date: "2026-08-26 08:00:00 +0200", qty: 12 },
          { date: "2026-08-26 18:00:00 +0200", qty: 18 },
        ] },
        { name: "running_power", units: "W", data: [
          { date: "2026-08-26 08:00:00 +0200", qty: 250 },
          { date: "2026-08-26 08:05:00 +0200", qty: 270 },
        ] },
      ],
    },
  });

  assert.equal(parsed.rows[0].values.oxygenSaturationPct, 98);
  assert.equal(parsed.rows[0].values.exerciseMinutes, 30);
  assert.equal(parsed.rows[0].values.runningPowerW, 260);
});
