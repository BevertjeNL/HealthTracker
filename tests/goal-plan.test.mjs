import assert from "node:assert/strict";
import test from "node:test";
import { addDays, buildGoalPlan, daysBetween, finishText, parseGoalInput } from "../src/lib/goal-plan.ts";

const now = new Date("2026-10-07T12:00:00Z");
const goal = { distanceM: 21097, raceDate: "2026-11-04", targetPaceSecPerKm: 320 };
const context = { recoveryScore: 75, loadChangePct: 4, generalAdvice: { label: "Rustige duurloop past vandaag", detail: "30–45 min rustig", coach: "Je normale ritme geeft ruimte." } };
const runs = Array.from({ length: 18 }, (_, index) => ({ startDate: new Date(now.getTime() - (index * 2 + 1) * 86_400_000), distanceM: index % 6 === 0 ? 16000 : 7000, movingTimeS: 2700, avgPaceMinPerKm: 6, name: "Training" }));

test("validates a goal and computes the user's half-marathon target time", () => {
  const parsed = parseGoalInput("21097", "2026-11-04", "5:20", "2026-10-07");
  assert.deepEqual(parsed.goal, goal);
  assert.equal(finishText(320 * 21.097), "1:52:31");
  assert.ok(parseGoalInput("21097", "2026-02-30", "5:20", "2026-01-01").error);
  assert.ok(parseGoalInput("21097", "2026-11-04", "5:70", "2026-10-07").error);
  assert.ok(parseGoalInput("42195", "2026-11-04", "5:20", "2026-10-07").error);
});

test("a four-week goal has specific sessions, a shorter final long run and race-day pacing", () => {
  const plan = buildGoalPlan(goal, runs, context, now);
  assert.equal(plan.daysUntilRace, 28);
  assert.equal(plan.level, "gericht voorbereiden");
  assert.equal(plan.weeks.length, 4);
  const longRuns = plan.weeks.flatMap((week) => week.days).filter((day) => day.tone === "long");
  assert.equal(longRuns.length, 3);
  assert.match(longRuns.at(-1).detail, /omvang neemt nu af/);
  assert.equal(plan.weeks.at(-1).days.some((day) => day.tone === "long"), false);
  assert.equal(plan.raceDay.date, "2026-11-04");
  assert.match(plan.raceDay.detail, /5:20/);
  assert.match(plan.weeks.flatMap((week) => week.days).find((day) => day.title === "Doeltempo verkennen").detail, /2 × 6 min/);
});

test("three sustained runs near goal pace permit a longer controlled tempo block", () => {
  const supported = runs.map((run, index) => index < 3 ? { ...run, distanceM: 12000, avgPaceMinPerKm: 5.4 } : run);
  const plan = buildGoalPlan(goal, supported, context, now);
  assert.match(plan.weeks.flatMap((week) => week.days).find((day) => day.title === "Doeltempo oefenen").detail, /3 × 8 min/);
});

test("a limited running base does not prescribe goal-pace intervals or a large long-run jump", () => {
  const sparse = [{ startDate: addDays("2026-10-07", -2) + "T12:00:00Z", distanceM: 5000 }, { startDate: addDays("2026-10-07", -12) + "T12:00:00Z", distanceM: 5000 }].map((run) => ({ ...run, startDate: new Date(run.startDate), movingTimeS: 1800, avgPaceMinPerKm: 6, name: "Run" }));
  const plan = buildGoalPlan(goal, sparse, context, now);
  assert.equal(plan.level, "basis opbouwen");
  assert.equal(plan.weeks.flatMap((week) => week.days).some((day) => day.tone === "quality" && day.detail.includes("5:20")), false);
  assert.match(plan.weeks.flatMap((week) => week.days).find((day) => day.tone === "long").detail, /6 km/);
});

test("a completed half marathon earns controlled weekly tempo work even with low run frequency", () => {
  const thursday = new Date("2026-10-08T12:00:00Z");
  const sparseButExperienced = [
    { startDate: new Date("2026-10-04T10:00:00Z"), distanceM: 21100, movingTimeS: 6840, avgPaceMinPerKm: 5.4, name: "Halve marathon" },
    { startDate: new Date("2026-09-25T10:00:00Z"), distanceM: 11000, movingTimeS: 3600, avgPaceMinPerKm: 5.45, name: "Training" },
    { startDate: new Date("2026-09-15T10:00:00Z"), distanceM: 9000, movingTimeS: 3100, avgPaceMinPerKm: 5.7, name: "Training" },
    { startDate: new Date("2026-09-05T10:00:00Z"), distanceM: 9000, movingTimeS: 3300, avgPaceMinPerKm: 5.9, name: "Training" },
  ];
  const plan = buildGoalPlan(goal, sparseButExperienced, context, thursday);
  const days = plan.weeks.flatMap((week) => week.days);
  assert.equal(plan.level, "gericht voorbereiden");
  assert.equal(days.filter((day) => day.tone === "quality").length, 4);
  assert.match(days.filter((day) => day.tone === "quality").at(-1).detail, /2 × 4 min/);
  assert.match(plan.today.label, /Soepel tempo/);
  assert.match(days.find((day) => day.tone === "long").detail, /12 km/);
  assert.match(days.find((day) => day.title === "Optionele rustige loop").detail, /Sla deze extra loop over/);
});

test("a newly imported distance run changes the generated plan", () => {
  const shortRuns = [2, 12].map((daysAgo) => ({ startDate: new Date(now.getTime() - daysAgo * 86_400_000), distanceM: 5000, movingTimeS: 1800, avgPaceMinPerKm: 6, name: "Training" }));
  const fullRun = { startDate: new Date(now.getTime() - 86400000), distanceM: 21097, movingTimeS: 6900, avgPaceMinPerKm: 5.45, name: "Halve marathon" };
  const before = buildGoalPlan(goal, shortRuns, context, now);
  const after = buildGoalPlan(goal, [...shortRuns, fullRun], context, now);
  assert.equal(before.level, "basis opbouwen");
  assert.equal(after.level, "gericht voorbereiden");
  assert.equal(before.weeks.flatMap((week) => week.days).some((day) => day.tone === "quality"), false);
  assert.equal(after.weeks.flatMap((week) => week.days).some((day) => day.tone === "quality"), true);
});

test("low recovery replaces today's quality session with rest", () => {
  const thursday = new Date("2026-10-08T12:00:00Z");
  const plan = buildGoalPlan(goal, runs, { ...context, recoveryScore: 40 }, thursday);
  assert.match(plan.today.label, /Herstel/);
  assert.equal(plan.weeks[0].days[0].status, "adjusted");
  assert.equal(plan.weeks[0].days[0].tone, "rest");
});

test("recent split deterioration postpones a hard session even when recovery score is normal", () => {
  const thursday = new Date("2026-10-08T12:00:00Z");
  const plan = buildGoalPlan(goal, runs, { ...context, lastRunWarning: { at: new Date("2026-10-07T08:00:00Z"), reason: "Tempoverlies in de tweede helft." } }, thursday);
  assert.equal(plan.today.label, "Herstel krijgt voorrang");
  assert.match(plan.today.coach, /Tempoverlies/);
  assert.equal(plan.weeks[0].days[0].status, "adjusted");
});

test("recent pacing deterioration changes the goal assessment after the immediate rest window", () => {
  const thursday = new Date("2026-10-08T12:00:00Z");
  const plan = buildGoalPlan(goal, runs, { ...context, lastRunWarning: { at: new Date("2026-10-04T08:00:00Z"), reason: "Tempoverlies in de tweede helft." } }, thursday);
  assert.match(plan.assessment, /rustigere start/);
  assert.match(plan.evidence.join(" "), /Tempoverlies/);
});

test("a Strava run today is recorded without claiming the prescribed workout was completed", () => {
  const runToday = { startDate: now, distanceM: 6500, movingTimeS: 2100, avgPaceMinPerKm: 5.4, name: "Loop" };
  const plan = buildGoalPlan(goal, [...runs, runToday], context, now);
  assert.equal(plan.weeks[0].days[0].status, "extra-run");
  assert.equal(plan.today.label, "Vandaag herstellen");
});

test("calendar arithmetic stays correct across the Amsterdam daylight-saving change", () => {
  assert.equal(daysBetween("2026-11-04", "2026-10-07"), 28);
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
});
