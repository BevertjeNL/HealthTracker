import assert from "node:assert/strict";
import test from "node:test";
import { badgeLabel, badgeTone, describeTrend } from "../src/lib/metric-guide.ts";
import { healthTrend, shiftDay } from "../src/lib/training-health.ts";

const today = "2026-10-18";
const days = (from, count, value) => Array.from({ length: count }, (_, i) => ({ date: shiftDay(from, i), ...value(i) }));
// 28 baseline days that swing around 40 ms, then 7 recent days.
const base = (recent) => [...days("2026-09-04", 28, (i) => ({ hrvMs: 40 + (i % 2 ? 5 : -5) })), ...days("2026-10-02", 7, () => ({ hrvMs: recent }))];

test("a difference smaller than your own daily swing is called normal", () => {
  const trend = healthTrend(base(38), "hrvMs", today);
  assert.equal(trend.severity, "normal");
  assert.equal(trend.direction, "flat");
  assert.equal(badgeLabel(trend), "Normaal voor jou");
  assert.match(describeTrend(trend).conclusion, /ruis/);
});

test("the same percentage is a clear deviation for a stable metric", () => {
  const steady = [...days("2026-09-04", 28, () => ({ hrvMs: 40 })), ...days("2026-10-02", 7, () => ({ hrvMs: 36 }))];
  const trend = healthTrend(steady, "hrvMs", today);
  assert.equal(trend.severity, "strong");
  assert.equal(trend.direction, "worse");
  assert.equal(badgeLabel(trend), "Duidelijk lager dan normaal");
  assert.match(describeTrend(trend).conclusion, /Veelvoorkomende oorzaken/);
});

test("a mild worsening is amber and asks for patience, not action", () => {
  const trend = healthTrend(base(35), "hrvMs", today);
  assert.equal(trend.severity, "mild");
  assert.equal(badgeTone(trend), "mild");
  assert.match(describeTrend(trend).conclusion, /aanhoudt/);
});

test("without a baseline the explanation says why instead of judging", () => {
  const trend = healthTrend(days("2026-10-10", 4, () => ({ hrvMs: 40 })), "hrvMs", today);
  assert.equal(trend.severity, null);
  assert.equal(badgeLabel(trend), "Nog geen basislijn");
  assert.equal(describeTrend(trend).conclusion, null);
  assert.match(describeTrend(trend).body, /te weinig eerdere metingen/);
});

test("stale metrics are described by their age and never judged", () => {
  const trend = healthTrend(days("2026-07-01", 40, () => ({ hrvMs: 40 })), "hrvMs", today);
  assert.equal(trend.current, null);
  assert.match(describeTrend(trend).body, /dagen oud/);
});
