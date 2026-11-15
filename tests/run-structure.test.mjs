import test from "node:test";
import assert from "node:assert/strict";
import { analyzePacing, buildRunDigest, classifyRun, kindSource, raceStatus, runIntent } from "../src/lib/run-analysis.ts";
import { detectStructure, structureSummary } from "../src/lib/run-structure.ts";
import { buildRunLesson } from "../src/lib/run-lesson.ts";

const unit = (index, paceSec, hr = null, extra = {}) => ({ index, label: String(index), distanceM: 1000, timeS: paceSec, hr, elevM: 0, gapSpeed: null, cadenceSpm: null, watts: null, partial: false, ...extra });
const units = (spec) => spec.flatMap(([count, pace, hr]) => Array.from({ length: count }, () => [pace, hr ?? null])).map(([pace, hr], index) => unit(index + 1, pace, hr));

const fastStart = () => units([[5, 314, 165], [14, 340, 148]]);

test("a fast block followed by easy running is found as one step in pace", () => {
  const structure = detectStructure(fastStart());
  assert.equal(structure.shape, "fast-start");
  assert.equal(structure.segments.length, 2);
  assert.equal(structure.segments[0].role, "snel");
  assert.equal(Math.round(structure.segments[0].distanceM), 5000);
  assert.equal(Math.round(structure.separationSec), 26);
  assert.match(structureSummary(structure), /km 0–5 op 5:14\/km, daarna km 5–19 op 5:40\/km/);
});

test("fast finish, tempo block with warm-up and cool-down, and repeated blocks are recognised", () => {
  assert.equal(detectStructure(units([[8, 340], [4, 310]])).shape, "fast-finish");
  assert.equal(detectStructure(units([[5, 340], [6, 310], [5, 340]])).shape, "mid-block");
  const warm = detectStructure(units([[2, 340], [12, 310], [2, 340]]));
  assert.equal(warm.shape, "mid-block");
  assert.deepEqual(warm.segments.map((segment) => segment.role), ["inloop", "snel", "uitloop"]);
  const reps = detectStructure(units([[2, 340], [1, 270], [1, 340], [1, 270], [1, 340], [1, 270], [1, 340], [1, 270], [2, 340]]));
  assert.equal(reps.shape, "intervals");
  assert.equal(reps.segments.filter((segment) => segment.role === "snel").length, 4);
});

test("a gradual slide, one fast kilometre or an even run is not a structure", () => {
  assert.equal(detectStructure([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => unit(i + 1, 300 + i * 5))), null);
  assert.equal(detectStructure(units([[1, 300], [11, 340]])), null);
  assert.equal(detectStructure(units([[12, 330]])), null);
  assert.equal(detectStructure(units([[3, 330]])), null);
});

test("without a label or choice the structure is shown neutrally and the athlete is asked", () => {
  const analysis = analyzePacing(fastStart(), "long", { intent: "unknown" });
  assert.equal(analysis.pattern, "two-part");
  assert.equal(analysis.structureApplied, true);
  assert.equal(analysis.needsConfirmation, true);
  assert.ok(!analysis.advice.some((item) => /vervallen|tempo zakte|tempoverlies/i.test(item.title)));
  const lesson = buildRunLesson("long", null, analysis, "Rust.");
  assert.match(lesson.headline, /twee delen/i);
  assert.match(lesson.improve, /bedoelde/i);
});

test("a training with a fast part is judged per part, not as fading", () => {
  const analysis = analyzePacing(fastStart(), "interval", { intent: "structured" });
  assert.equal(analysis.pattern, "two-part");
  assert.equal(analysis.needsConfirmation, false);
  assert.ok(analysis.rows[0].note === "Snel deel" && analysis.rows[10].note === "Rustig deel");
  const lesson = buildRunLesson("interval", null, analysis, "Rust.");
  assert.match(lesson.headline, /Snel deel van 5 km/);
  assert.match(lesson.meaning, /5:14\/km/);
  assert.doesNotMatch(lesson.headline, /zakte/);
});

test("when the athlete says one steady run, the fast start counts as going out too fast", () => {
  const analysis = analyzePacing(fastStart(), "long", { intent: "steady" });
  assert.equal(analysis.structure, null);
  assert.equal(analysis.structureApplied, false);
  assert.match(buildRunLesson("long", null, analysis, "Rust.").headline, /tempo|snel|verloor/i);
});

test("a race is always judged as a race, and a fading structured block is called out", () => {
  assert.equal(analyzePacing(fastStart(), "race", { intent: "unknown" }).structure, null);
  const sagging = analyzePacing(units([[1, 300], [1, 304], [1, 310], [1, 316], [1, 322], [10, 345]]), "interval", { intent: "structured" });
  assert.equal(sagging.structureApplied, true);
  assert.ok(sagging.advice.some((item) => item.tone === "watch" && /zakte/i.test(item.title)));
});

test("kind, source and intent follow your choice first, then the Strava label, then the name", () => {
  assert.equal(classifyRun({ name: "Training", distanceM: 19000, kindOverride: "interval" }), "interval");
  assert.equal(classifyRun({ name: "Training", distanceM: 19000, kindOverride: "easy" }), "easy");
  assert.equal(classifyRun({ name: "Rotterdam Wedstrijd 10K", distanceM: 10000, kindOverride: "long" }), "long");
  assert.equal(raceStatus({ name: "Rotterdam Wedstrijd 10K", kindOverride: "easy" }), "none");
  assert.equal(runIntent({ name: "Training", workoutType: 3 }), "structured");
  assert.equal(runIntent({ name: "Training", workoutType: 2 }), "steady");
  assert.equal(runIntent({ name: "Tempo 5 km", workoutType: 0 }), "structured");
  assert.equal(runIntent({ name: "Training", workoutType: 0 }), "unknown");
  assert.equal(runIntent({ name: "Training", workoutType: 0, kindOverride: "long" }), "steady");
  assert.equal(kindSource({ name: "Training", kindOverride: "long", workoutType: 3 }), "keuze");
  assert.equal(kindSource({ name: "Training", workoutType: 3 }), "strava");
  assert.equal(kindSource({ name: "Lange duurloop" }), "naam");
  assert.equal(kindSource({ name: "Training", workoutType: 0, distanceM: 6000 }), "afstand");
});

test("the journal verdict asks when the type is unknown and judges per part when it is known", () => {
  const raw = { splits_metric: fastStart().map((item) => ({ split: item.index, distance: 1000, moving_time: item.timeS, average_heartrate: item.hr })) };
  const base = { id: 1, name: "Training", startDate: new Date("2026-11-14T08:00:00Z"), distanceM: 19000, movingTimeS: 19000 / 1000 * 332, paceMinPerKm: 5.53, avgHr: 152, maxHr: 175, elevationM: 0, cadenceSpm: null, sufferScore: null, workoutType: 0, kindOverride: null, raw };
  const unknown = buildRunDigest([base])[0];
  assert.match(unknown.verdict, /\?$/);
  assert.match(unknown.detail, /Bevestig/);
  const known = buildRunDigest([{ ...base, kindOverride: "interval" }])[0];
  assert.doesNotMatch(known.verdict, /\?$|vervallen|Langzamer/);
});
