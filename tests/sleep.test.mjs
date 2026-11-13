import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSleep } from "../src/lib/sleep.ts";
import { watchWorkout } from "../src/lib/watch-workout.ts";

test("a fresh short night changes the recommendation, stale data does not", () => {
  const recent = analyzeSleep([{ date: "2026-11-12", sleepHours: 5.5 }], "2026-11-13");
  assert.equal(recent.concern, true);
  assert.equal(analyzeSleep([{ date: "2026-11-10", sleepHours: 5.5 }], "2026-11-13").concern, false);
});

test("weekly sleep comparison needs enough actual nights", () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({ date: new Date(Date.UTC(2026, 9, 9 + index)).toISOString().slice(0, 10), sleepHours: index < 28 ? 8 : 6.8 }));
  const result = analyzeSleep(rows, "2026-11-12");
  assert.equal(result.concern, true);
  assert.equal(result.recentCount, 7);
  assert.equal(result.baselineCount, 28);
});

test("watch steps only appear for interval prescriptions", () => {
  assert.equal(watchWorkout("30–40 min rustig"), null);
  assert.deepEqual(watchWorkout("10 min rustig inlopen · 3 × 6 min stevig met 3 min dribbelpauze · 10 min uitlopen"), ["10 min rustig inlopen", "3 × 6 min stevig met 3 min dribbelpauze", "10 min uitlopen"]);
});
