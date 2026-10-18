import assert from "node:assert/strict";
import test from "node:test";
import { buildBodyAlert, buildDaySeries, buildFitnessTrend, buildLinkInsights, buildResponseProfile, buildRunBodyContext, buildRunLoads, buildTrainingHealth, healthTrend, loadBalance, pearson, shiftDay } from "../src/lib/training-health.ts";

const today = "2026-10-18";
const run = (id, day, extra = {}) => ({ id, stravaId: String(id), name: "Rustige duurloop", type: "Run", startDate: new Date(`${day}T08:00:00Z`), distanceM: 8000, movingTimeS: 2880, elapsedTimeS: 2880, elevationGainM: 20, avgHeartRate: 140, maxHeartRate: 175, avgPaceMinPerKm: 6, avgCadence: 85, sufferScore: null, kindOverride: null, raw: {}, ...extra });
const hday = (date, extra = {}) => ({ date, restingHeartRate: 50, hrvMs: 60, ...extra });
const range = (from, count) => Array.from({ length: count }, (_, i) => shiftDay(from, i));

test("run load uses heart rate and falls back to the athlete's own typical intensity", () => {
  const health = range("2026-08-01", 60).map((date) => hday(date));
  const loads = buildRunLoads([run(1, "2026-09-01"), run(2, "2026-09-03", { avgHeartRate: null })], health);
  assert.equal(loads[0].loadBasis, "hartslag");
  assert.equal(loads[1].loadBasis, "geschat");
  assert.ok(loads[0].load > 0);
  assert.ok(Math.abs(loads[1].load - loads[0].load) <= 1);
});

test("load balance needs 28 days of history before it reports a ratio", () => {
  const fresh = buildRunLoads([run(1, "2026-10-10")], []);
  assert.equal(loadBalance(buildDaySeries(fresh, [], today)).tone, "unknown");
  const rows = range("2026-08-01", 78).filter((_, i) => i % 2 === 0).map((day, i) => run(i + 1, day));
  const balance = loadBalance(buildDaySeries(buildRunLoads(rows, []), [], today));
  assert.equal(balance.tone, "good");
  assert.ok(balance.ratio > 0.8 && balance.ratio < 1.2);
});

test("a sudden jump in load is flagged against the chronic week", () => {
  const steady = range("2026-08-01", 60).filter((_, i) => i % 3 === 0).map((day, i) => run(i + 1, day, { distanceM: 6000, movingTimeS: 2160 }));
  const spike = range("2026-10-12", 6).map((day, i) => run(100 + i, day, { distanceM: 15000, movingTimeS: 5400 }));
  const balance = loadBalance(buildDaySeries(buildRunLoads([...steady, ...spike], []), [], today));
  assert.ok(["warning", "critical"].includes(balance.tone));
});

test("health trend shows the newest value with its age and refuses a baseline under three samples", () => {
  const rows = [...range("2026-09-01", 36).map((date) => hday(date, { hrvMs: 60 })), ...range("2026-10-07", 7).map((date) => hday(date, { hrvMs: 48 }))];
  const trend = healthTrend(rows, "hrvMs", today);
  assert.equal(trend.currentAgeDays, 5);
  assert.equal(trend.current, 48);
  assert.equal(trend.direction, "worse");
  const sparse = healthTrend([hday("2026-10-12"), hday("2026-10-13")], "hrvMs", today);
  assert.equal(sparse.baseline, null);
  assert.equal(sparse.deltaPct, null);
  assert.equal(sparse.direction, "unknown");
  assert.equal(healthTrend([hday("2026-08-01")], "hrvMs", today).current, null);
});

test("fitness trend compares equal windows of steady runs and stays silent with too few", () => {
  const mk = (day, hr, id) => run(id, day, { avgHeartRate: hr });
  const previous = [mk("2026-07-10", 150, 1), mk("2026-07-17", 150, 2), mk("2026-07-24", 150, 3)];
  const recent = [mk("2026-09-20", 140, 4), mk("2026-09-27", 140, 5), mk("2026-10-04", 140, 6)];
  const trend = buildFitnessTrend(buildRunLoads([...previous, ...recent], []), today);
  assert.equal(trend.verdict.tone, "good");
  assert.ok(trend.efficiency.deltaPct > 5);
  const thin = buildFitnessTrend(buildRunLoads(recent.slice(0, 2), []), today);
  assert.equal(thin.efficiency.deltaPct, null);
  assert.equal(thin.verdict.tone, "unknown");
  assert.equal(thin.efficiency.slopePct90, null);
});

test("response profile only reports a bucket with at least three next-morning samples", () => {
  const health = range("2026-07-01", 100).map((date) => hday(date));
  assert.equal(buildResponseProfile(buildRunLoads([run(1, "2026-09-01")], health), health).enough, false);
  const days = range("2026-08-01", 60).filter((_, i) => i % 2 === 0);
  const rows = days.map((day, i) => run(i + 1, day, i % 3 === 0 ? { distanceM: 18000, movingTimeS: 6480 } : {}));
  const crashed = health.map((row) => rows.some((r) => shiftDay(r.startDate.toISOString().slice(0, 10), 1) === row.date && r.distanceM > 10000) ? { ...row, hrvMs: 45 } : row);
  const profile = buildResponseProfile(buildRunLoads(rows, crashed), crashed);
  assert.equal(profile.enough, true);
  assert.ok(profile.buckets.find((b) => b.label === "Zwaar").hrvDeltaPct < -10);
  assert.match(profile.summary, /zakt je HRV/);
});

test("pearson and link insights keep a minimum of eight pairs", () => {
  assert.equal(pearson([{ x: 1, y: 1 }, { x: 2, y: 2 }]), null);
  assert.ok(pearson([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]) > 0.99);
  const links = buildLinkInsights(buildRunLoads([run(1, "2026-10-01")], []), []);
  assert.ok(links.every((link) => link.verdict === "onvoldoende"));
});

test("link insight finds a clear HRV-to-efficiency relationship", () => {
  const days = range("2026-07-01", 80).filter((_, i) => i % 3 === 0);
  const health = range("2026-06-01", 140).map((date) => hday(date, { hrvMs: 60 + (Number(date.slice(-2)) % 7) * 3 }));
  const byDay = new Map(health.map((row) => [row.date, row]));
  const rows = days.map((day, i) => run(i + 1, day, { avgHeartRate: 160 - (byDay.get(day).hrvMs - 60) }));
  const link = buildLinkInsights(buildRunLoads(rows, health), health).find((item) => item.id === "hrv-vs-efficiency");
  assert.equal(link.verdict, "verband");
  assert.ok(link.r > 0.25);
});

test("body alert needs concurring signals and says so when there is no baseline", () => {
  const rows = [...range("2026-09-01", 40).map((date) => hday(date)), ...range("2026-10-12", 6).map((date) => hday(date, { hrvMs: 45, restingHeartRate: 56 }))];
  const trends = ["hrvMs", "restingHeartRate"].map((key) => healthTrend(rows, key, today));
  const alert = buildBodyAlert(trends);
  assert.equal(alert.level, "let-op");
  assert.equal(alert.signals.length, 2);
  assert.equal(buildBodyAlert([healthTrend([], "hrvMs", today)]).level, "ok");
  assert.match(buildBodyAlert([healthTrend([], "hrvMs", today)]).title, /Nog geen/);
});

test("run body context compares the morning to the personal baseline and the next morning's response", () => {
  const health = range("2026-09-01", 40).map((date) => hday(date));
  const day = "2026-10-05";
  const patched = health.map((row) => row.date === day ? { ...row, hrvMs: 48 } : row.date === shiftDay(day, 1) ? { ...row, hrvMs: 42, restingHeartRate: 55 } : row);
  const loads = buildRunLoads([run(1, day)], patched);
  const context = buildRunBodyContext(loads[0], day, patched, loads);
  assert.equal(context.readiness.tone, "warning");
  assert.equal(context.before.hrvDeltaPct, -20);
  assert.equal(context.after.hrvDeltaPct, -30);
  assert.equal(context.loadShareOfWeekPct, 100);
});

test("training-health bundle works with no health data at all", () => {
  const bundle = buildTrainingHealth([run(1, "2026-10-10")], [], new Date("2026-10-18T10:00:00Z"));
  assert.equal(bundle.healthAgeDays, null);
  assert.equal(bundle.alert.level, "ok");
  assert.equal(bundle.trends.hrvMs.current, null);
  assert.equal(bundle.days.length, 120);
});
