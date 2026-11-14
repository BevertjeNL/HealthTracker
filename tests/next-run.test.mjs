import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachToday } from "../src/lib/coach.ts";
import { buildNextRun } from "../src/lib/next-run.ts";

// Zaterdag 14 november 2026, 's avonds
const now = new Date("2026-11-14T21:00:00Z");
const run = (id, day, distanceM = 8000, extra = {}) => ({ id, stravaId: String(id), name: "Rustige duurloop", type: "Run", startDate: new Date(`${day}T08:00:00Z`), distanceM, movingTimeS: distanceM / 1000 * 360, elapsedTimeS: distanceM / 1000 * 360, elevationGainM: 20, avgHeartRate: 135, maxHeartRate: 165, avgPaceMinPerKm: 6, avgCadence: 82, sufferScore: 25, kindOverride: null, raw: {}, createdAt: now, ...extra });
const okBody = { alertLevel: "ok", alertSignals: [], hrvDeltaPct: 5, rhrDeltaPct: -3 };
const history = [run(1, "2026-11-14", 19400, { name: "Lange duurloop" }), ...["2026-11-06", "2026-11-03", "2026-10-31", "2026-10-29", "2026-10-26", "2026-10-23", "2026-10-21", "2026-10-18", "2026-10-15", "2026-10-13", "2026-10-10", "2026-10-07"].map((day, index) => run(index + 2, day, index % 3 === 2 ? 11000 : 7500))];
const next = (runs, body = okBody, planDays = null) => buildNextRun({ runs, coach: buildCoachToday(runs, [], now), body, planDays });

test("after a long run today the next run is a later day, never 'run again today'", () => {
  const result = next(history);
  assert.equal(result.ranToday, true);
  assert.ok(result.offset >= 2, `offset ${result.offset}`);
  assert.notEqual(result.kind, "rest");
  assert.doesNotMatch(`${result.title} ${result.detail}`, /nogmaals|niet nogmaals/i);
  assert.match(result.basis.join(" "), /rustdagen/);
});

test("a run today after a short easy run opens the way for tomorrow", () => {
  const runs = [run(1, "2026-11-14", 5000), ...history.slice(1)];
  assert.ok(next(runs).offset <= 1);
});

test("two body signals push the next run back and keep it easy", () => {
  const calm = next(history);
  const alert = next(history, { alertLevel: "let-op", alertSignals: ["HRV 18% onder je basis", "Rusthartslag 8% boven je basis"], hrvDeltaPct: -18, rhrDeltaPct: 8 });
  assert.ok(alert.offset >= calm.offset);
  assert.ok(alert.kind === "easy" || alert.kind === "recovery");
  assert.equal(alert.tone, "warning");
  assert.match(alert.basis.join(" "), /HRV 18%/);
});

test("a stop alert waits at least two days and shows a critical tone", () => {
  const result = next(history, { alertLevel: "stop", alertSignals: ["a", "b", "c"], hrvDeltaPct: -20, rhrDeltaPct: 10 });
  assert.ok(result.offset >= 2);
  assert.equal(result.tone, "critical");
});

test("a rested day with no run today advises running today", () => {
  const runs = history.slice(1);
  const result = next(runs);
  assert.equal(result.ranToday, false);
  assert.ok(result.offset <= 1);
});

test("an active plan supplies the session but not before the earliest allowed day", () => {
  const planDays = [0, 1, 2, 3, 4].map((offset) => ({ date: `2026-11-${14 + offset}`, title: offset === 2 ? "Drempel" : "Plan", detail: "10 min inlopen · 2 × 8 min op tempo · 10 min uitlopen", tone: offset === 2 ? "quality" : "easy", status: offset === 0 ? "run-recorded" : "planned", actualKm: null }));
  const result = next(history, okBody, planDays);
  assert.equal(result.source, "schema");
  assert.ok(result.date >= "2026-11-16");
});

test("a heavy plan session right after the earliest day becomes an easy run when the body asks for rest", () => {
  const planDays = [{ date: "2026-11-17", title: "Drempel", detail: "x", tone: "quality", status: "planned", actualKm: null }];
  const result = next(history, { alertLevel: "let-op", alertSignals: ["HRV 15% onder je basis"], hrvDeltaPct: -15, rhrDeltaPct: 0 }, planDays);
  assert.equal(result.source, "coach");
  assert.notEqual(result.kind, "quality");
});

test("no runs at all gives an easy start, not a crash", () => {
  const result = next([]);
  assert.equal(result.ranToday, false);
  assert.notEqual(result.kind, "rest");
});
