import assert from "node:assert/strict";
import test from "node:test";
import { buildRunStats, weekdayIndex } from "../src/lib/run-stats.ts";

const run = (iso, km, extra = {}) => ({ startDate: new Date(iso), distanceM: km * 1000, movingTimeS: km * 360, elevationGainM: 10, avgPaceMinPerKm: 6, name: "Run", ...extra });
const NOW = new Date("2026-10-17T10:00:00Z"); // a Saturday

test("empty history yields no stats", () => {
  assert.equal(buildRunStats([], NOW), null);
  assert.equal(buildRunStats([run("2026-10-01T08:00:00Z", 0)], NOW), null);
});

test("weekday index starts on Monday", () => {
  assert.equal(weekdayIndex(Math.round(Date.UTC(2026, 9, 17) / 86_400_000)), 5);
  assert.equal(weekdayIndex(Math.round(Date.UTC(2026, 9, 19) / 86_400_000)), 0);
});

test("totals, years and month sums add up", () => {
  const stats = buildRunStats([run("2025-03-05T08:00:00Z", 10), run("2025-03-20T08:00:00Z", 5), run("2026-10-02T08:00:00Z", 8)], NOW);
  assert.equal(stats.totalKm, 23);
  assert.equal(stats.totalRuns, 3);
  assert.deepEqual(stats.years.map((y) => y.year), [2025, 2026]);
  assert.equal(stats.years[0].months[2], 15);
  assert.equal(stats.years[1].months[9], 8);
  assert.equal(stats.years[0].ytdKm, 15);
});

test("percentages are withheld when the earlier period has fewer than three runs", () => {
  const few = buildRunStats([run("2026-09-05T08:00:00Z", 10), run("2026-09-06T08:00:00Z", 10), run("2026-10-05T08:00:00Z", 10)], NOW);
  assert.equal(few.comparisons[0].deltaPct, null);
  const enough = buildRunStats([run("2026-09-02T08:00:00Z", 5), run("2026-09-05T08:00:00Z", 5), run("2026-09-06T08:00:00Z", 5), run("2026-10-05T08:00:00Z", 30)], NOW);
  assert.equal(enough.comparisons[0].previous.runs, 3);
  assert.equal(enough.comparisons[0].deltaPct, 100);
});

test("local calendar day is Amsterdam, not UTC", () => {
  const stats = buildRunStats([run("2026-10-16T22:30:00Z", 5)], NOW); // 00:30 on the 17th in Amsterdam (CEST)
  assert.equal(stats.lastDay, "2026-10-17");
  assert.equal(stats.daysSinceLast, 0);
});

test("streaks, breaks and the live streak", () => {
  const stats = buildRunStats([
    run("2026-09-01T08:00:00Z", 5), run("2026-09-02T08:00:00Z", 5), run("2026-09-03T08:00:00Z", 5), run("2026-09-04T08:00:00Z", 5),
    run("2026-10-15T08:00:00Z", 5), run("2026-10-16T08:00:00Z", 5),
  ], NOW);
  assert.equal(stats.streaks.longestDays.length, 4);
  assert.equal(stats.streaks.currentDays, 2);
  assert.equal(stats.streaks.longestBreak.days, 40);
  const dead = buildRunStats([run("2026-10-10T08:00:00Z", 5)], NOW);
  assert.equal(dead.streaks.currentDays, 0);
});

test("trend needs runs in at least three recent weeks", () => {
  assert.equal(buildRunStats([run("2026-10-15T08:00:00Z", 5)], NOW).trend.direction, "unknown");
  const growing = [];
  for (let w = 0; w < 8; w++) growing.push(run(new Date(NOW.getTime() - (7 - w) * 7 * 86_400_000 + 3600_000).toISOString(), 5 + w * 3));
  const stats = buildRunStats(growing, NOW);
  assert.equal(stats.trend.direction, "up");
  assert.ok(stats.trend.slopeKmPerWeek > 0);
});

test("favourite weekday, day part and records", () => {
  const stats = buildRunStats([
    run("2026-10-03T06:00:00Z", 12, { avgPaceMinPerKm: 5.5 }), run("2026-10-10T06:00:00Z", 21.5, { elevationGainM: 120 }), run("2026-10-14T16:00:00Z", 3, { avgPaceMinPerKm: 4.5 }),
  ], NOW);
  assert.equal(stats.favoriteWeekday, 5);
  assert.equal(stats.favoriteDayPart, 0);
  assert.equal(stats.records.longest.km, 21.5);
  assert.equal(stats.records.fastest5k.km, 12);
  assert.equal(stats.records.fastest10k.km, 12);
  assert.equal(stats.records.climb.elev, 120);
  assert.equal(stats.persona, null);
  assert.equal(stats.buckets.at(-1).runs, 1);
});

test("journey picks the last reached landmark and the next one", () => {
  const stats = buildRunStats([run("2026-10-02T08:00:00Z", 50), run("2026-10-03T08:00:00Z", 50), run("2026-10-04T08:00:00Z", 50), run("2026-10-05T08:00:00Z", 50)], NOW);
  assert.equal(stats.journey.reached.name, "Brussel");
  assert.equal(stats.journey.next.name, "Parijs");
  assert.ok(Math.abs(stats.journey.kmToNext - 230) < 1e-9);
});

test("heatmap covers 53 weeks of 7 days and marks future days", () => {
  const stats = buildRunStats([run("2026-10-16T08:00:00Z", 6)], NOW);
  assert.equal(stats.heatmap.length, 53);
  assert.ok(stats.heatmap.every((week) => week.length === 7));
  assert.equal(stats.heatmap[52][0].day, "2026-10-12");
  assert.equal(stats.heatmap[52][4].level, 2);
  assert.equal(stats.heatmap[52][6].future, true);
});
