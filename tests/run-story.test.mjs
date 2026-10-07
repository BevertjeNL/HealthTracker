import assert from "node:assert/strict";
import test from "node:test";
import { analyzePacing } from "../src/lib/run-analysis.ts";
import { buildRunStory } from "../src/lib/run-story.ts";

const run = { id: 1, name: "Training", startDate: new Date("2026-01-01T10:00:00Z"), distanceM: 5000, movingTimeS: 1500, paceMinPerKm: 5, avgHr: 155, maxHr: 180, elevationM: 35, cadenceSpm: 170, sufferScore: 60, workoutType: null, kindOverride: null, raw: { elapsed_time: 1650, average_watts: 240, max_watts: 310, calories: 400 } };
const units = [280, 295, 300, 305, 320].map((timeS, index) => ({ index: index + 1, label: String(index + 1), distanceM: 1000, timeS, hr: 150 + index * 5, elevM: index === 2 ? 12 : 0, gapSpeed: null, cadenceSpm: null, watts: null, partial: false }));

test("run story explains start, middle, finish and available load signals", () => {
  const analysis = analyzePacing(units, "easy");
  const story = buildRunStory(run, "easy", analysis, units);
  assert.deepEqual(story.points.slice(0, 3).map((point) => point.phase), ["Start", "Midden", "Slot"]);
  assert.match(story.points[0].detail, /rustiger/);
  assert.match(story.points[1].detail, /stijging/);
  assert.match(story.points[2].detail, /hartslag/i);
  assert.match(story.points[3].detail, /W gemiddeld/);
  assert.ok(story.available.includes("vermogen"));
});

test("run story does not infer per-kilometer course from too few splits", () => {
  const short = units.slice(0, 2);
  const story = buildRunStory({ ...run, raw: {} }, "easy", analyzePacing(short, "easy"), short);
  assert.equal(story.hasSplits, false);
  assert.ok(!story.points.some((point) => point.phase === "Slot"));
});
