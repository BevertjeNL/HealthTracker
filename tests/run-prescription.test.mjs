import assert from "node:assert/strict";
import test from "node:test";
import { assessPaceReserve, estimatePaceZones, prescribeNextRun, restDaysAfter } from "../src/lib/run-prescription.ts";
import { buildRunLesson } from "../src/lib/run-lesson.ts";

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 86_400_000;
const run = (daysAgo, km, paceSec, extra = {}) => ({ id: Math.round(daysAgo * 100 + km), name: "Rondje", startDate: new Date(NOW.getTime() - daysAgo * DAY), distanceM: km * 1000, movingTimeS: km * paceSec, paceMinPerKm: paceSec / 60, avgHr: 140, maxHr: 180, elevationM: 10, cadenceSpm: 170, sufferScore: null, workoutType: null, kindOverride: null, raw: {}, ...extra });
const base = [run(40, 6, 360), run(33, 7, 355), run(26, 5, 330, { name: "Tempo" }), run(19, 8, 350), run(12, 10, 300, { name: "Parkrun 10K", workoutType: 1 }), run(8, 6, 350), run(5, 8, 345)];
const pacing = (extra = {}) => ({ unitCount: 10, avgPaceSec: 330, firstHalfPaceSec: 332, secondHalfPaceSec: 328, splitDiffSec: -4, cvPct: 2, firstUnitDeltaSec: 2, lastUnitDeltaSec: -9, hrDriftPct: 1, decouplingPct: 0, gradeAdjusted: false, pattern: "negative", fastest: { label: "10", paceSec: 320 }, slowest: { label: "1", paceSec: 340 }, rows: [], advice: [], ...extra });

test("pace zones come from the best recent effort and need three runs", () => {
  assert.equal(estimatePaceZones(base.slice(0, 2), NOW), null);
  const zones = estimatePaceZones(base, NOW);
  assert.ok(zones); assert.equal(zones.reliable, true);
  assert.equal(Math.round(zones.tenKPaceSec), 300);
  assert.ok(zones.easy.fast > 360 && zones.easy.slow < 410, "easy zone is derived from performance, not from the usual jog pace");
  assert.ok(zones.threshold < zones.marathon && zones.marathon < zones.easy.fast);
  assert.equal(zones.easyHrCap, 144);
});

test("rest days after a run depend on what it was", () => {
  assert.equal(restDaysAfter(run(1, 21.1, 300, { workoutType: 1 })), 3);
  assert.equal(restDaysAfter(run(1, 16, 350)), 2);
  assert.equal(restDaysAfter(run(1, 6, 350)), 0);
});

test("the day after a half marathon is rest, with an optional recovery jog and pace", () => {
  const race = run(1, 21.1, 300, { workoutType: 1 });
  const plan = prescribeNextRun({ runs: [...base, race], now: NOW, daysSinceLast: 1, readiness: 80, loadChangePct: 5 });
  assert.equal(plan.kind, "rest");
  assert.match(plan.why, /3 dagen/);
});

test("after enough rest the plan names distance and pace", () => {
  const plan = prescribeNextRun({ runs: base, now: NOW, daysSinceLast: 3, readiness: 80, loadChangePct: 0 });
  assert.notEqual(plan.kind, "rest");
  assert.ok(plan.distanceKm && plan.distanceKm[0] >= 3);
  assert.match(plan.detail, /Na 3 dagen rust/);
  assert.match(plan.detail, /\d:\d\d–\d:\d\d\/km/);
});

test("a long break restarts with a shorter easy run", () => {
  const plan = prescribeNextRun({ runs: base, now: NOW, daysSinceLast: 16, readiness: null, loadChangePct: null });
  assert.equal(plan.title, "Rustig herstarten");
  assert.match(plan.detail, /Na 16 dagen rust/);
});

test("poor recovery turns the day into rest and says why", () => {
  const plan = prescribeNextRun({ runs: base, now: NOW, daysSinceLast: 3, readiness: 50, loadChangePct: 0 });
  assert.equal(plan.kind, "rest");
  assert.match(plan.why, /50\/100/);
});

test("quality is offered only when fresh, never right after a hard run", () => {
  const many = [...base, run(6, 10, 345), run(3, 6, 350), run(10, 6, 350), run(16, 7, 350), run(22, 6, 350)];
  const plan = prescribeNextRun({ runs: many.filter((item) => item.name !== "Tempo"), now: NOW, daysSinceLast: 2, readiness: 82, loadChangePct: 0 });
  assert.equal(plan.kind, "quality");
  assert.match(plan.detail, /\d × \d min op/);
});

test("a faster second half is advised only with evidence of reserve", () => {
  const reserve = assessPaceReserve(pacing(), "race", 160, 185);
  assert.equal(reserve.hasReserve, true);
  assert.ok(reserve.push.fast < 328 && reserve.push.slow < 328);
  assert.equal(assessPaceReserve(pacing({ pattern: "fade", splitDiffSec: 12 }), "race", 160, 185).hasReserve, false);
  assert.equal(assessPaceReserve(pacing({ hrDriftPct: 8 }), "race", 160, 185).hasReserve, false);
  assert.equal(assessPaceReserve(pacing(), "interval", 160, 185), null);
});

test("lessons name the faster second-half pace when there is reserve, and an even pace when fading", () => {
  const reserve = assessPaceReserve(pacing(), "race", 160, 185);
  const lesson = buildRunLesson("race", null, pacing(), "volgende", reserve);
  assert.match(lesson.headline, /snellere tweede helft/);
  assert.match(lesson.improve, /5:18–5:23\/km/);
  const fade = pacing({ pattern: "heavy-fade", splitDiffSec: 20, firstHalfPaceSec: 320, secondHalfPaceSec: 340, lastUnitDeltaSec: 12, hrDriftPct: 7 });
  const fadeLesson = buildRunLesson("race", null, fade, "volgende", assessPaceReserve(fade, "race", 160, 185));
  assert.match(fadeLesson.improve, /5:30/);
  assert.doesNotMatch(fadeLesson.improve, /snellere tweede helft/);
});

test("with only easy runs the zones are flagged as a cautious guess and no quality session is prescribed", () => {
  const easy = [0, 3, 6, 9, 12, 15, 18, 21].map((d) => run(d + 4, 8, 360));
  const zones = estimatePaceZones(easy, NOW);
  assert.equal(zones.reliable, false);
  assert.ok(zones.easy.slow < 420, "a jog is not a performance");
  const plan = prescribeNextRun({ runs: easy, now: NOW, daysSinceLast: 4, readiness: 85, loadChangePct: 0 });
  assert.notEqual(plan.kind, "quality");
});
