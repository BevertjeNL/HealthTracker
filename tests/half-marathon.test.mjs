import test from "node:test";
import assert from "node:assert/strict";
import { buildHalfMarathonPlan } from "../src/lib/half-marathon.ts";

const now = new Date("2026-09-09T12:00:00Z");
const run = (daysAgo, distanceKm, pace = 6) => ({
  startDate: new Date(now.getTime() - daysAgo * 86_400_000),
  distanceM: distanceKm * 1000,
  avgPaceMinPerKm: pace,
});

test("keeps new runners in a base-building phase", () => {
  const plan = buildHalfMarathonPlan([run(2, 5), run(16, 5)], now);
  assert.equal(plan.phase, "Basis bouwen");
  assert.equal(plan.distanceProgressPct, 24);
  assert.match(plan.adjustments[0].title, /2 loopdagen/);
});

test("moves consistent runners with long runs into specific preparation", () => {
  const runs = [run(1, 5), run(2, 14), run(5, 7), run(9, 8), run(12, 6), run(14, 5), run(16, 13), run(19, 7), run(23, 8), run(27, 6), run(29, 5), run(31, 12), run(35, 7), run(39, 6), run(41, 5)];
  const plan = buildHalfMarathonPlan(runs, now);
  assert.equal(plan.phase, "Specifiek voorbereiden");
  assert.equal(plan.activeWeeks, 6);
  assert.equal(plan.adjustments[2].action, "Max. 1× per week");
});
