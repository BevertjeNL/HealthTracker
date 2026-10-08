import test from "node:test";
import assert from "node:assert/strict";
import { analyzePacing } from "../src/lib/run-analysis.ts";
import { buildRunLesson } from "../src/lib/run-lesson.ts";

const units = (paces) => paces.map((timeS, index) => ({ index: index + 1, label: `${index + 1}`, distanceM: 1000, timeS, hr: null, elevM: 0, gapSpeed: null, cadenceSpm: null, watts: null, partial: false }));

test("a severe second-half slowdown becomes a clear running correction", () => {
  const analysis = analyzePacing(units([300, 302, 304, 320, 324, 326]), "race");
  const lesson = buildRunLesson("race", { tone: "good", verdict: "Snelle wedstrijd", detail: "Sterke tijd" }, analysis, "Loop rustig.");
  assert.equal(lesson.tone, "critical");
  assert.match(lesson.improve, /eerste 2 kilometer/);
  assert.match(lesson.keep, /afstand/);
});

test("even pacing tells the runner what to preserve", () => {
  const analysis = analyzePacing(units([305, 305, 305, 305, 305]), "long");
  const lesson = buildRunLesson("long", null, analysis, "Loop rustig.");
  assert.equal(lesson.tone, "good");
  assert.match(lesson.keep, /Herhaal/);
});

test("summary-only runs still provide a usable running instruction", () => {
  const lesson = buildRunLesson("easy", null, null, "30 minuten rustig.");
  assert.match(lesson.improve, /snelle stukken/);
  assert.equal(lesson.nextRun, "30 minuten rustig.");
});
