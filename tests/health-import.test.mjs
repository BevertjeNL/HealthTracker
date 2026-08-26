import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHealthMetricValue } from "../src/lib/health-import.ts";

test("converts Health Auto Export active energy from kJ to kcal", () => {
  assert.ok(Math.abs(normalizeHealthMetricValue("active_energy", "kJ", 418.4) - 100) < 0.001);
  assert.equal(normalizeHealthMetricValue("active_energy", "kcal", 100), 100);
});

test("normalizes both Health Auto Export weight metric names", () => {
  const pounds = 154.324;
  assert.ok(Math.abs(normalizeHealthMetricValue("weight_&_body_mass", "lb", pounds) - 70) < 0.01);
  assert.equal(normalizeHealthMetricValue("weight_body_mass", "kg", 70), 70);
});
