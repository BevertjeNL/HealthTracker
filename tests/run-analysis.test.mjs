import test from "node:test";
import assert from "node:assert/strict";
import { analyzePacing, buildRunAnalysis, classifyRun, compareToSimilar, distanceBand, lapsAreDistinct, parseKmSplits, parseLaps } from "../src/lib/run-analysis.ts";

const now = new Date("2026-10-01T12:00:00Z");
const day = 86_400_000;
const unit = (index, paceSec, hr = null, elevM = 0, extra = {}) => ({ index, label: String(index), distanceM: 1000, timeS: paceSec, hr, elevM, gapSpeed: null, cadenceSpm: null, partial: false, ...extra });
const run = (id, daysAgo, km, paceMin, extra = {}) => ({ id, name: "Run", startDate: new Date(now.getTime() - daysAgo * day), distanceM: km * 1000, movingTimeS: Math.round(km * paceMin * 60), paceMinPerKm: paceMin, avgHr: null, maxHr: null, elevationM: 0, cadenceSpm: null, sufferScore: null, workoutType: null, raw: {}, ...extra });

test("classifies race, long, interval and easy runs", () => {
  assert.equal(classifyRun({ name: "Ochtendloop", workoutType: 1, distanceM: 5000 }), "race");
  assert.equal(classifyRun({ name: "Rotterdam Wedstrijd 10K", distanceM: 10000 }), "race");
  assert.equal(classifyRun({ name: "Race pace training", distanceM: 8000 }), "easy");
  assert.equal(classifyRun({ name: "Intervallen 6x400", distanceM: 7000 }), "interval");
  assert.equal(classifyRun({ name: "Zondagloop", distanceM: 16000 }), "long");
  assert.equal(classifyRun({ name: "Ochtendloop", distanceM: 6000 }), "easy");
});

test("maps distances to race bands", () => {
  assert.equal(distanceBand(10080)?.key, "10k");
  assert.equal(distanceBand(21300)?.key, "half");
  assert.equal(distanceBand(7000), null);
});

test("detects a too-fast start and fade in a race", () => {
  const units = [unit(1, 270, 160), unit(2, 285, 168), unit(3, 290, 172), unit(4, 295, 175), unit(5, 300, 177), unit(6, 305, 179)];
  const analysis = analyzePacing(units, "race");
  assert.equal(analysis.pattern, "heavy-fade");
  assert.ok(analysis.firstUnitDeltaSec <= -10);
  assert.ok(analysis.advice.some((item) => /Te snel weggelopen/.test(item.title)));
  assert.ok(analysis.rows[0].note.startsWith("Te snel gestart"));
  assert.ok(analysis.decouplingPct > 0);
});

test("recognises an even and a negative split", () => {
  assert.equal(analyzePacing([1, 2, 3, 4].map((i) => unit(i, 300)), "easy").pattern, "even");
  assert.equal(analyzePacing([unit(1, 310), unit(2, 308), unit(3, 296), unit(4, 290)], "long").pattern, "negative");
});

test("requires at least three full units", () => {
  assert.equal(analyzePacing([unit(1, 300), unit(2, 300)], "easy"), null);
  assert.equal(analyzePacing([unit(1, 300), unit(2, 300), unit(3, 300, null, 0, { partial: true, distanceM: 300 })], "easy"), null);
});

test("explains slow kilometres with a climb instead of blaming fatigue", () => {
  const analysis = analyzePacing([unit(1, 300), unit(2, 300), unit(3, 330, null, 15), unit(4, 300), unit(5, 300)], "easy");
  assert.match(analysis.rows[2].note, /Klim/);
});

test("labels interval blocks", () => {
  const analysis = analyzePacing([unit(1, 360), unit(2, 240), unit(3, 360), unit(4, 242), unit(5, 360), unit(6, 250), unit(7, 360)], "interval");
  assert.equal(analysis.pattern, "intervals");
  assert.equal(analysis.rows[1].note, "Snel blok");
  assert.ok(analysis.advice.length >= 1);
});

test("parses splits and laps from Strava raw JSON", () => {
  const raw = { splits_metric: [{ split: 1, distance: 1000, moving_time: 300, elevation_difference: 2, average_heartrate: 150 }, { split: 2, distance: 400, moving_time: 120 }, { split: 3, distance: "x" }], laps: [{ lap_index: 1, distance: 2000, moving_time: 600, average_cadence: 85 }, { lap_index: 2, distance: 3000, moving_time: 800 }] };
  const splits = parseKmSplits(raw);
  assert.equal(splits.length, 2);
  assert.equal(splits[1].partial, true);
  const laps = parseLaps(raw);
  assert.equal(laps[0].cadenceSpm, 170);
  assert.equal(lapsAreDistinct(laps, splits), true);
  const auto = Array.from({ length: 5 }, (_, i) => ({ ...unit(i + 1, 300) }));
  assert.equal(lapsAreDistinct(auto, auto), false);
});

test("compares a run to similar earlier runs only with enough samples", () => {
  const history = [run(1, 100, 10, 5.5, { name: "Wedstrijd 10K" }), run(2, 200, 10, 5.6, { name: "Wedstrijd 10K" }), run(3, 300, 10, 5.7, { name: "Wedstrijd 10K" })];
  const current = run(4, 1, 10, 5.3, { name: "Wedstrijd 10K" });
  const comparison = compareToSimilar(current, [...history, current]);
  assert.equal(comparison.rank, 1);
  assert.ok(comparison.paceDeltaSec < 0);
  assert.equal(compareToSimilar(current, [history[0], current]), null);
});

test("builds training-versus-race comparison and predictions", () => {
  const easy = [3, 6, 10, 14, 20, 30].map((d, i) => run(10 + i, d, 6, 6.5));
  const race = run(1, 20, 10, 5.0, { name: "Stadsloop wedstrijd", workoutType: 1 });
  const analysis = buildRunAnalysis([...easy, race], now);
  assert.equal(analysis.races.length, 1);
  assert.ok(Math.abs(analysis.trainingVsRace.gapSec - 90) < 2);
  assert.equal(analysis.predictions.source, "race");
  assert.equal(analysis.predictions.items[2].label, "Halve marathon");
  assert.ok(analysis.insights.some((item) => item.id === "gap-ok"));
});

test("does not show trends or comparisons from too few runs", () => {
  const analysis = buildRunAnalysis([run(1, 3, 5, 6), run(2, 10, 5, 6)], now);
  assert.equal(analysis.insights.length, 0);
  assert.equal(analysis.trainingVsRace, null);
  assert.equal(analysis.form.efficiencyChangePct, null);
  assert.match(analysis.headline.title, /te weinig/);
});

test("flags a volume jump and rustige runs that are too hard", () => {
  const prev = [40, 45, 50, 55].map((d, i) => run(20 + i, d, 5, 6, { avgHr: 150, maxHr: 185 }));
  const recent = [2, 6, 10, 14, 18].map((d, i) => run(40 + i, d, 10, 5.8, { avgHr: 160, maxHr: 185 }));
  const analysis = buildRunAnalysis([...prev, ...recent], now);
  assert.ok(analysis.insights.some((item) => item.id === "volume-jump"));
  assert.ok(analysis.insights.some((item) => item.id === "easy-too-hard"));
  assert.equal(analysis.insights[0].tone, "action");
});

test("measures a pacing style across runs with kilometre splits", () => {
  const withSplits = (id, daysAgo) => run(id, daysAgo, 5, 5.5, { raw: { splits_metric: [270, 285, 290, 295, 300].map((t, i) => ({ split: i + 1, distance: 1000, moving_time: t })) } });
  const analysis = buildRunAnalysis([1, 3, 5, 7].map((d, i) => withSplits(i + 1, d)), now);
  assert.equal(analysis.style.training.runs, 4);
  assert.ok(analysis.insights.some((item) => item.id === "style-fast-start"));
  assert.equal(analysis.coverage.withSplits, 4);
});
