import assert from "node:assert/strict";
import test from "node:test";
import { clockToStoredMinutes, parseHealthPayload, isValidHealthMetricValue } from "../src/lib/health-import.ts";
import { buildSleepNights as aggregateNights, nightDate, sleepStageFromAppleValue } from "../src/lib/sleep-import.ts";
import { buildSleepNights, buildSleepReport, fmtClock, fmtDuration, sleepAfterLoad, summarizeSleep, SLEEP_TARGET_MIN } from "../src/lib/sleep.ts";

const day = (offset) => new Date(Date.UTC(2026, 9, 28 + offset, 12)).toISOString().slice(0, 10);
const row = (offset, extra = {}) => ({ date: day(offset), sleepAsleepMin: 450, sleepDeepMin: 70, sleepRemMin: 100, sleepCoreMin: 280, sleepAwakeMin: 30, sleepBedtimeMin: 330, sleepWakeMin: 400, ...extra });
const now = new Date("2026-10-28T09:00:00Z");

test("parses a sleep shortcut payload with clock times", () => {
  const parsed = parseHealthPayload({ source: "apple-shortcuts", date: "2026-10-28", sleep_asleep: 452, sleep_deep: "68 min", sleep_rem: 101, sleep_core: 283, sleep_awake: 24, sleep_bedtime: "23:30", sleep_wake: "07:02" });
  assert.deepEqual(parsed.rows[0].values, { sleepAsleepMin: 452, sleepDeepMin: 68, sleepRemMin: 101, sleepCoreMin: 283, sleepAwakeMin: 24, sleepBedtimeMin: 330, sleepWakeMin: 422 });
  assert.deepEqual(parsed.ignoredMetrics, []);
});

test("derives total sleep from the stages and rejects impossible sleep values", () => {
  const derived = parseHealthPayload({ source: "apple-shortcuts", date: "2026-10-28", sleep_deep: 60, sleep_rem: 90, sleep_core: 270 });
  assert.equal(derived.rows[0].values.sleepAsleepMin, 420);
  const bad = parseHealthPayload({ source: "apple-shortcuts", date: "2026-10-28", sleep_asleep: 5, sleep_bedtime: "25:00", sleep_wake: "soon" });
  assert.equal(bad.rows.length, 0);
  assert.equal(isValidHealthMetricValue("sleep_asleep", 5000), false);
});

test("bedtime counts from 18:00 so midnight does not wrap", () => {
  assert.equal(clockToStoredMinutes("sleep_bedtime", "23:30"), 330);
  assert.equal(clockToStoredMinutes("sleep_bedtime", "01:00"), 420);
  assert.equal(clockToStoredMinutes("sleep_wake", "07:15"), 435);
  assert.equal(fmtClock(330, "bedtime"), "23:30");
  assert.equal(fmtClock(420, "bedtime"), "01:00");
  assert.equal(fmtClock(435, "wake"), "07:15");
  assert.equal(fmtDuration(452), "7 u 32 min");
});

const sample = (start, end, stage, source = "Apple Watch") => ({ start, end, stage, source, durationMin: (new Date(end.replace(" ", "T") + "Z") - new Date(start.replace(" ", "T") + "Z")) / 60000 });

test("aggregates export samples into one night per wake-up date from the best source", () => {
  assert.equal(sleepStageFromAppleValue("HKCategoryValueSleepAnalysisAsleepREM"), "rem");
  assert.equal(nightDate("2026-10-27 23:10:00"), "2026-10-28");
  assert.equal(nightDate("2026-10-28 01:10:00"), "2026-10-28");
  const nights = aggregateNights([
    sample("2026-10-27 23:00:00", "2026-10-28 01:00:00", "core"),
    sample("2026-10-28 01:00:00", "2026-10-28 02:00:00", "deep"),
    sample("2026-10-28 02:00:00", "2026-10-28 02:30:00", "awake"),
    sample("2026-10-28 02:30:00", "2026-10-28 04:00:00", "rem"),
    sample("2026-10-28 04:00:00", "2026-10-28 07:00:00", "core"),
    sample("2026-10-27 22:50:00", "2026-10-28 07:05:00", "inBed", "iPhone"),
    sample("2026-10-27 14:00:00", "2026-10-27 14:40:00", "core"),
  ]);
  assert.equal(nights.length, 1);
  assert.deepEqual(nights[0], { date: "2026-10-28", sleepAsleepMin: 450, sleepDeepMin: 60, sleepRemMin: 90, sleepCoreMin: 300, sleepAwakeMin: 30, sleepBedtimeMin: 300, sleepWakeMin: 420 });
});

test("nights without stages keep stage columns empty", () => {
  const nights = aggregateNights([sample("2026-10-27 23:00:00", "2026-10-28 06:00:00", "unspecified")]);
  assert.equal(nights[0].sleepAsleepMin, 420);
  assert.equal(nights[0].sleepDeepMin, null);
});

test("night score and stage shares come from the available parts", () => {
  const [night] = buildSleepNights([row(0)]);
  assert.equal(night.efficiencyPct, 93.8);
  assert.equal(night.deepPct, 15.6);
  assert.ok(night.score > 80 && night.score <= 100);
  assert.deepEqual(night.scoreParts.map((part) => part.label), ["Duur", "Diepe slaap en REM", "Onafgebroken"]);
  const [bare] = buildSleepNights([{ date: day(0), sleepAsleepMin: 225 }]);
  assert.equal(bare.score, 50);
  assert.equal(bare.deepPct, null);
});

test("shows no averages, debt or regularity below the minimum sample size", () => {
  const nights = buildSleepNights([row(0), row(-1)]);
  const summary = summarizeSleep(nights, day(0));
  assert.equal(summary.avgAsleep7, null);
  assert.equal(summary.debtMin, null);
  assert.equal(summary.bedtimeSd, null);
  assert.equal(summary.deepPct, null);
});

test("computes sleep debt, regularity and the change against the earlier baseline", () => {
  const recent = [0, -1, -2, -3, -4].map((o, i) => row(o, { sleepAsleepMin: 360 + i * 10, sleepBedtimeMin: 300 + i * 40 }));
  const earlier = Array.from({ length: 10 }, (_, i) => row(-10 - i, { sleepAsleepMin: 450 }));
  const summary = summarizeSleep(buildSleepNights([...recent, ...earlier]), day(0));
  assert.equal(summary.nights7, 5);
  assert.equal(summary.avgAsleep7, 380);
  assert.equal(summary.avgAsleep28, 450);
  assert.equal(summary.deltaMin, -70);
  assert.equal(summary.debtMin, 5 * SLEEP_TARGET_MIN - 1900);
  assert.ok(summary.bedtimeSd > 50);
});

test("advice flags a short night, debt on a heavy week and stale data", () => {
  const shortWeek = [0, -1, -2, -3, -4].map((o) => row(o, { sleepAsleepMin: 330, sleepBedtimeMin: 330 }));
  const report = buildSleepReport(shortWeek, [], 1.5, now);
  const ids = report.advice.map((item) => item.id);
  assert.ok(ids.includes("short-night"));
  const debt = report.advice.find((item) => item.id === "debt");
  assert.equal(debt.tone, "critical");
  assert.match(debt.detail, /zwaarder is dan normaal/);

  const stale = buildSleepReport([row(-8), row(-9), row(-10)], [], null, now);
  assert.deepEqual(stale.advice.map((item) => item.id), ["stale"]);
});

test("advice is empty without sleep and positive with a steady good week", () => {
  assert.deepEqual(buildSleepReport([], [], null, now).advice, []);
  const good = buildSleepReport([0, -1, -2, -3, -4, -5].map((o) => row(o, { sleepAsleepMin: 465 })), [], 1, now);
  assert.equal(good.advice[0].id, "ok");
});

test("links need at least eight pairs before reporting anything", () => {
  const rows = [0, -1, -2, -3].map((o) => row(o, { hrvMs: 50 }));
  const report = buildSleepReport(rows, [], null, now);
  assert.ok(report.links.every((link) => link.verdict === "onvoldoende"));
});

test("finds a sleep to HRV link when the data supports it", () => {
  const rows = Array.from({ length: 40 }, (_, i) => { const asleep = 360 + (i % 7) * 20; return row(-i, { sleepAsleepMin: asleep, hrvMs: 40 + (asleep - 360) / 4 + (i % 3) }); });
  const report = buildSleepReport(rows, [], null, now);
  const link = report.links.find((item) => item.id === "sleep-vs-hrv");
  assert.equal(link.verdict, "verband");
  assert.ok(link.r > 0.25);
});

test("sleep after a hard day needs enough nights in both groups", () => {
  assert.equal(sleepAfterLoad(buildSleepNights([row(0)]), []).enough, false);
});
