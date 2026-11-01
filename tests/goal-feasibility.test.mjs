import assert from "node:assert/strict";
import test from "node:test";
import { buildGoalFeasibility } from "../src/lib/goal-feasibility.ts";

const now = new Date("2026-10-20T12:00:00Z");
const run = (daysAgo, km, paceSec, name = "Training", extra = {}) => ({ id: daysAgo, name, startDate: new Date(now.getTime() - daysAgo * 86_400_000), distanceM: km * 1000, movingTimeS: km * paceSec, paceMinPerKm: paceSec / 60, avgHr: 150, maxHr: 175, elevationM: 0, cadenceSpm: null, sufferScore: null, workoutType: null, kindOverride: null, raw: {}, ...extra });
const half = { distanceM: 21097, targetPaceSecPerKm: 320 };

test("no basis gives no feasibility claim", () => {
  assert.equal(buildGoalFeasibility(half, [run(3, 8, 360), run(6, 8, 360)], 19, now), null);
});

test("a recent race on the goal distance drives the prediction", () => {
  const result = buildGoalFeasibility(half, [run(16, 21.1, 322, "Halve marathon Oostland", { kindOverride: "race" })], 19, now);
  assert.equal(result.basisSource, "race");
  assert.equal(result.label, "Haalbaar");
  assert.equal(result.tone, "good");
  const close = buildGoalFeasibility(half, [run(16, 21.1, 324, "Halve marathon Oostland", { kindOverride: "race" })], 19, now);
  assert.equal(close.label, "Ambitieus");
});

test("a much slower basis makes the goal too sharp and points at a realistic pace", () => {
  const result = buildGoalFeasibility(half, [run(16, 21.1, 345, "Halve marathon", { kindOverride: "race" })], 19, now);
  assert.equal(result.label, "Te scherp");
  assert.match(result.detail, /5:4\d/);
});

test("training basis needs three qualifying runs and is labelled as conservative", () => {
  const result = buildGoalFeasibility(half, [run(3, 10, 330), run(9, 12, 335), run(14, 8, 340)], 19, now);
  assert.equal(result.basisSource, "training");
  assert.match(result.basis, /voorzichtig/);
});

test("a race whose stored pace is slower than moving time uses the stored pace as the single source of truth", () => {
  const race = run(16, 21.2, 314, "Halve marathon Oostland", { kindOverride: "race", paceMinPerKm: 324 / 60 });
  const result = buildGoalFeasibility(half, [race], 19, now);
  assert.equal(result.label, "Ambitieus");
  assert.ok(result.predictedPaceSec > 320);
});
