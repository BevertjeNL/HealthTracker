import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachToday, buildLoadPicture, buildPostRunCoach, postRunPlanWarning } from "../src/lib/coach.ts";

const now = new Date("2026-10-07T12:00:00Z");
const run = (id, day, distanceM = 8000, extra = {}) => ({ id, stravaId: String(id), name: "Rustige duurloop", type: "Run", startDate: new Date(`${day}T08:00:00Z`), distanceM, movingTimeS: distanceM / 1000 * 360, elapsedTimeS: distanceM / 1000 * 360, elevationGainM: 20, avgHeartRate: 135, maxHeartRate: 165, avgPaceMinPerKm: 6, avgCadence: 82, sufferScore: 25, kindOverride: null, raw: {}, createdAt: now, ...extra });
const health = (date, hrvMs, restingHeartRate) => ({ date, hrvMs, restingHeartRate, cardioRecovery1m: null, walkingHeartRateAverage: null });

test("only meaningful split fade or heart-rate drift warns the goal planner", () => {
  const at = new Date("2026-10-07T08:00:00Z");
  assert.match(postRunPlanWarning({ pacing: { pattern: "fade", hrDriftPct: null }, kind: "easy" }, at).reason, /tweede helft/);
  assert.match(postRunPlanWarning({ pacing: { pattern: "even", hrDriftPct: 7 }, kind: "easy" }, at).reason, /hartslag/);
  assert.equal(postRunPlanWarning({ pacing: { pattern: "even", hrDriftPct: 7 }, kind: "interval" }, at), null);
  assert.equal(postRunPlanWarning({ pacing: null, kind: "easy" }, at), null);
});

test("weekly load does not claim a baseline from fewer than three active weeks", () => {
  const sparse = [run(1, "2026-10-06"), run(2, "2026-09-20")];
  assert.equal(buildLoadPicture(sparse, now).changePct, null);
  assert.equal(buildLoadPicture(sparse, now).weeklyKm, 8);
});

test("today's advice keeps incomplete Health information explicit", () => {
  const view = buildCoachToday([run(1, "2026-10-07")], [], now);
  assert.match(view.advice.label, /niet nogmaals lopen/i);
  assert.equal(view.recovery.score, null);
  assert.ok(view.reason.every((item) => !item.includes("Apple Health")));
});

test("post-run coach uses a personal baseline and two next-day signals", () => {
  const base = [1, 2, 3, 4, 5, 6].map((day) => health(`2026-09-${String(day + 19).padStart(2, "0")}`, 50, 50));
  const target = run(10, "2026-10-01", 12000, { name: "Lange duurloop" });
  const response = buildPostRunCoach(target, [target], [...base, health("2026-10-02", 40, 55)]);
  assert.equal(response.hrv.deltaPct, -20);
  assert.equal(response.restingHr.deltaPct, 10);
  assert.match(response.recoveryTitle, /onder druk/i);
  assert.match(response.nextStep, /rustige dag/i);
});

test("a same-day Health reading is not treated as a post-run measurement", () => {
  const target = run(10, "2026-10-01");
  const response = buildPostRunCoach(target, [target], [health("2026-10-01", 50, 50)]);
  assert.equal(response.hasHealthOnRunDay, true);
  assert.equal(response.hrv.after, null);
  assert.match(response.recoveryTitle, /training eerst landen/i);
});

test("post-run signals from different calendar days do not become a paired recovery verdict", () => {
  const base = [1, 2, 3, 4, 5, 6].map((day) => health(`2026-09-${String(day + 19).padStart(2, "0")}`, 50, 50));
  const target = run(10, "2026-10-01", 12000, { name: "Lange duurloop" });
  const response = buildPostRunCoach(target, [target], [...base, health("2026-10-02", 40, null), health("2026-10-03", null, 55)]);
  assert.match(response.recoveryText, /verschillende dagen/i);
  assert.doesNotMatch(response.nextStep, /signalen normaliseren/i);
});
