// Pure statistics over the whole run history. Calendar days are Europe/Amsterdam; day arithmetic uses UTC day numbers.
export type StatRun = {
  startDate: Date;
  distanceM: number | null;
  movingTimeS: number | null;
  elevationGainM: number | null;
  avgPaceMinPerKm: number | null;
  name?: string | null;
};

const DAY = 86_400_000;
const MIN_SAMPLES = 3;
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23" });

export const localDay = (date: Date) => dayFormat.format(date);
const localHour = (date: Date) => Number(hourFormat.format(date));
export const dayNumberOf = (year: number, month: number, day: number) => Math.round(Date.UTC(year, month - 1, day) / DAY);
export const dayNumber = (text: string) => { const [y, m, d] = text.split("-").map(Number); return dayNumberOf(y, m, d); };
export const dayText = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
// 1970-01-01 was a Thursday, so day number 0 has weekday index 3 (Monday = 0). Weeks start on Monday.
export const weekdayIndex = (n: number) => (((n + 3) % 7) + 7) % 7;
export const weekIndex = (n: number) => Math.floor((n + 3) / 7);

export const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const;
export const DAY_PARTS = [
  { label: "Ochtend", range: "05:00 tot 12:00" },
  { label: "Middag", range: "12:00 tot 18:00" },
  { label: "Avond", range: "18:00 tot 23:00" },
  { label: "Nacht", range: "23:00 tot 05:00" },
] as const;
export const LANDMARKS = [
  { name: "Brussel", km: 175 }, { name: "Parijs", km: 430 }, { name: "Berlijn", km: 580 }, { name: "Wenen", km: 940 },
  { name: "Rome", km: 1300 }, { name: "Madrid", km: 1480 }, { name: "Moskou", km: 2150 }, { name: "New York", km: 5850 },
  { name: "Kaapstad", km: 9650 }, { name: "Sydney", km: 16600 }, { name: "een rondje om de aarde", km: 40075 }, { name: "de maan", km: 384400 },
] as const;
const MONTH_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

type Item = { day: string; dn: number; km: number; timeS: number; elev: number; pace: number | null; hour: number; name: string | null };
type Window = { km: number; runs: number; days: number };

const windowOf = (items: Item[], from: number, to: number): Window => {
  const picked = items.filter((item) => item.dn >= from && item.dn <= to);
  return { km: picked.reduce((sum, item) => sum + item.km, 0), runs: picked.length, days: new Set(picked.map((item) => item.dn)).size };
};

function compare(label: string, detail: string, current: Window, previous: Window) {
  // A percentage is only shown when the earlier period holds enough runs to be a fair baseline.
  const deltaPct = previous.runs >= MIN_SAMPLES && previous.km > 0 ? Math.round((current.km / previous.km - 1) * 100) : null;
  return { label, detail, current, previous, deltaPct };
}

function slope(values: number[]) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => { num += (x - meanX) * (y - meanY); den += (x - meanX) ** 2; });
  return den ? num / den : 0;
}

function longestStreak(sorted: number[]) {
  let best = { length: 0, from: 0, to: 0 };
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] !== sorted[i - 1] + 1) {
      const length = i - start;
      if (length > best.length) best = { length, from: sorted[start], to: sorted[i - 1] };
      start = i;
    }
  }
  return best;
}

// A streak is still alive when the last unit (day or week) is the current one or the one before it.
function currentStreak(sorted: number[], now: number) {
  const last = sorted.at(-1);
  if (last === undefined || last < now - 1) return 0;
  let length = 1;
  for (let i = sorted.length - 2; i >= 0 && sorted[i] === sorted[i + 1] - 1; i--) length++;
  return length;
}

const heatLevel = (km: number) => (km <= 0 ? 0 : km < 5 ? 1 : km < 10 ? 2 : km < 15 ? 3 : 4);

function groupMax(items: Item[], keyOf: (item: Item) => string | number) {
  const totals = new Map<string | number, number>();
  for (const item of items) totals.set(keyOf(item), (totals.get(keyOf(item)) ?? 0) + item.km);
  let best: { key: string | number; km: number } | null = null;
  for (const [key, km] of totals) if (!best || km > best.km) best = { key, km };
  return best;
}

export function buildRunStats(runs: StatRun[], now = new Date()) {
  const items: Item[] = runs
    .filter((run) => (run.distanceM ?? 0) > 0)
    .map((run) => {
      const day = localDay(run.startDate);
      return { day, dn: dayNumber(day), km: (run.distanceM ?? 0) / 1000, timeS: run.movingTimeS ?? 0, elev: run.elevationGainM ?? 0, pace: run.avgPaceMinPerKm ?? null, hour: localHour(run.startDate), name: run.name ?? null };
    })
    .sort((a, b) => a.dn - b.dn);
  if (!items.length) return null;

  const todayText = localDay(now);
  const today = dayNumber(todayText);
  const [ty, tm, td] = todayText.split("-").map(Number);
  const sumKm = (list: Item[]) => list.reduce((sum, item) => sum + item.km, 0);
  const totalKm = sumKm(items);
  const totalTimeS = items.reduce((sum, item) => sum + item.timeS, 0);
  const totalElev = items.reduce((sum, item) => sum + item.elev, 0);
  const runDays = [...new Set(items.map((item) => item.dn))];
  const firstDn = items[0].dn;
  const lastDn = items[items.length - 1].dn;

  // Years and months
  const firstYear = Number(items[0].day.slice(0, 4));
  const years = [] as { year: number; km: number; ytdKm: number; runs: number; runDays: number; timeS: number; elev: number; avgPace: number | null; longestKm: number; avgKmPerRun: number; avgKmPerWeek: number; months: number[] }[];
  for (let year = firstYear; year <= ty; year++) {
    const list = items.filter((item) => item.day.startsWith(`${year}-`));
    const km = sumKm(list);
    const timeS = list.reduce((sum, item) => sum + item.timeS, 0);
    const cut = dayNumberOf(year, tm, Math.min(td, daysInMonth(year, tm)));
    const from = Math.max(dayNumberOf(year, 1, 1), firstDn);
    const to = Math.min(dayNumberOf(year, 12, 31), today);
    const months = Array.from({ length: 12 }, (_, m) => sumKm(list.filter((item) => Number(item.day.slice(5, 7)) === m + 1)));
    years.push({
      year, km, runs: list.length, runDays: new Set(list.map((item) => item.dn)).size, timeS, elev: list.reduce((sum, item) => sum + item.elev, 0),
      ytdKm: sumKm(list.filter((item) => item.dn <= cut)),
      avgPace: km > 0 && timeS > 0 ? timeS / 60 / km : null,
      longestKm: list.reduce((max, item) => Math.max(max, item.km), 0),
      avgKmPerRun: list.length ? km / list.length : 0,
      avgKmPerWeek: to >= from ? km / ((to - from + 1) / 7) : 0,
      months,
    });
  }

  // Comparisons with earlier periods
  const monthStart = dayNumberOf(ty, tm, 1);
  const prevMonthY = tm === 1 ? ty - 1 : ty;
  const prevMonthM = tm === 1 ? 12 : tm - 1;
  const prevMonthStart = dayNumberOf(prevMonthY, prevMonthM, 1);
  const prevMonthCut = dayNumberOf(prevMonthY, prevMonthM, Math.min(td, daysInMonth(prevMonthY, prevMonthM)));
  const lastYearMonthStart = dayNumberOf(ty - 1, tm, 1);
  const lastYearCut = dayNumberOf(ty - 1, tm, Math.min(td, daysInMonth(ty - 1, tm)));
  const dateLabel = `${td} ${MONTH_SHORT[tm - 1]}`;
  const comparisons = [
    compare("Deze maand", `1 t/m ${dateLabel}, tegenover dezelfde dagen vorige maand`, windowOf(items, monthStart, today), windowOf(items, prevMonthStart, prevMonthCut)),
    compare("Zelfde maand vorig jaar", `1 t/m ${dateLabel}, tegenover ${ty - 1}`, windowOf(items, monthStart, today), windowOf(items, lastYearMonthStart, lastYearCut)),
    compare("Laatste 28 dagen", "tegenover de 28 dagen daarvoor", windowOf(items, today - 27, today), windowOf(items, today - 55, today - 28)),
    compare("Dit jaar tot nu", `1 jan t/m ${dateLabel}, tegenover ${ty - 1}`, windowOf(items, dayNumberOf(ty, 1, 1), today), windowOf(items, dayNumberOf(ty - 1, 1, 1), lastYearCut)),
  ];

  // Weekly trend: rolling 7-day windows ending today
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const end = today - (25 - i) * 7;
    return { end: dayText(end), ...windowOf(items, end - 6, end) };
  });
  const recentWeeks = weeks.slice(-12);
  const enough = recentWeeks.filter((week) => week.runs > 0).length >= MIN_SAMPLES;
  const meanKmPerWeek = recentWeeks.reduce((sum, week) => sum + week.km, 0) / recentWeeks.length;
  const slopeKmPerWeek = slope(recentWeeks.map((week) => week.km));
  const trendPct = meanKmPerWeek > 0 ? (slopeKmPerWeek * 11) / meanKmPerWeek : 0;
  const trend = { weeks, enough, slopeKmPerWeek, meanKmPerWeek, direction: !enough ? ("unknown" as const) : trendPct > 0.1 ? ("up" as const) : trendPct < -0.1 ? ("down" as const) : ("flat" as const) };

  // Run days
  const weekdayRuns = Array(7).fill(0) as number[];
  const weekdayKm = Array(7).fill(0) as number[];
  for (const item of items) { weekdayRuns[weekdayIndex(item.dn)]++; weekdayKm[weekdayIndex(item.dn)] += item.km; }
  const favoriteWeekday = items.length >= MIN_SAMPLES ? weekdayRuns.indexOf(Math.max(...weekdayRuns)) : null;
  const partOf = (hour: number) => (hour >= 5 && hour < 12 ? 0 : hour >= 12 && hour < 18 ? 1 : hour >= 18 && hour < 23 ? 2 : 3);
  const dayPartRuns = Array(4).fill(0) as number[];
  for (const item of items) dayPartRuns[partOf(item.hour)]++;
  const favoriteDayPart = items.length >= MIN_SAMPLES ? dayPartRuns.indexOf(Math.max(...dayPartRuns)) : null;
  const weekendShare = totalKm > 0 ? (weekdayKm[5] + weekdayKm[6]) / totalKm : 0;

  // Calendar heatmap: 53 weeks ending with the current week
  const byDayKm = new Map<number, number>();
  for (const item of items) byDayKm.set(item.dn, (byDayKm.get(item.dn) ?? 0) + item.km);
  const startWeek = weekIndex(today) - 52;
  const heatmap = Array.from({ length: 53 }, (_, col) => Array.from({ length: 7 }, (_, row) => {
    const dn = (startWeek + col) * 7 - 3 + row;
    const km = byDayKm.get(dn) ?? 0;
    return { day: dayText(dn), km, level: heatLevel(km), future: dn > today };
  }));
  const heatmapMonths = heatmap.map((column, i) => {
    const month = Number(column[0].day.slice(5, 7));
    const previous = i === 0 ? 0 : Number(heatmap[i - 1][0].day.slice(5, 7));
    return month !== previous ? MONTH_SHORT[month - 1] : null;
  });
  const heatmapDays = heatmap.flat().filter((cell) => !cell.future);

  // Streaks and breaks
  const weekIdxs = [...new Set(runDays.map(weekIndex))];
  let longestBreak = { days: 0, from: 0, to: 0 };
  for (let i = 1; i < runDays.length; i++) {
    const gap = runDays[i] - runDays[i - 1] - 1;
    if (gap > longestBreak.days) longestBreak = { days: gap, from: runDays[i - 1], to: runDays[i] };
  }
  const thisYear = years[years.length - 1];
  const daysThisYear = today - dayNumberOf(ty, 1, 1) + 1;

  // Records
  const record = (item: Item | null) => (item ? { day: item.day, name: item.name, km: item.km, timeS: item.timeS, elev: item.elev, pace: item.pace } : null);
  const longest = items.reduce((best, item) => (item.km > best.km ? item : best), items[0]);
  const longestTime = items.reduce((best, item) => (item.timeS > best.timeS ? item : best), items[0]);
  const climb = items.reduce((best, item) => (item.elev > best.elev ? item : best), items[0]);
  const fastestFrom = (minKm: number) => items.filter((item) => item.km >= minKm && item.pace && item.pace > 0).reduce<Item | null>((best, item) => (!best || item.pace! < best.pace! ? item : best), null);
  const bestDay = groupMax(items, (item) => item.dn);
  const bestWeek = groupMax(items, (item) => weekIndex(item.dn));
  const bestMonth = groupMax(items, (item) => item.day.slice(0, 7));

  // Distance mix
  const buckets = [
    { label: "Tot 5 km", min: 0, max: 5 }, { label: "5 tot 10 km", min: 5, max: 10 }, { label: "10 tot 15 km", min: 10, max: 15 },
    { label: "15 tot 21 km", min: 15, max: 21.0975 }, { label: "Halve marathon of meer", min: 21.0975, max: Infinity },
  ].map((bucket) => ({ label: bucket.label, runs: items.filter((item) => item.km >= bucket.min && item.km < bucket.max).length }));

  // Fun equivalents
  const reached = [...LANDMARKS].reverse().find((landmark) => landmark.km <= totalKm) ?? null;
  const next = LANDMARKS.find((landmark) => landmark.km > totalKm) ?? null;
  const base = reached?.km ?? 0;
  const journey = { reached, next, kmToNext: next ? next.km - totalKm : 0, progressPct: next ? Math.round(((totalKm - base) / (next.km - base)) * 100) : 100 };

  const persona = items.length >= 10 && favoriteDayPart !== null ? {
    title: ["De Ochtendleeuw", "De Lunchlooper", "De Avondvlinder", "De Nachtuil"][favoriteDayPart],
    text: weekendShare >= 0.55 ? "Je loopt het liefst in het weekend." : weekendShare <= 0.25 ? "Je bewaart je kilometers voor de werkweek." : "Je spreidt je kilometers over de hele week.",
  } : null;

  return {
    todayText, totalKm, totalRuns: items.length, totalTimeS, totalElev, runDayCount: runDays.length, firstDay: items[0].day, lastDay: dayText(lastDn), daysSinceLast: today - lastDn,
    avgKmPerRun: totalKm / items.length, avgPace: totalKm > 0 && totalTimeS > 0 ? totalTimeS / 60 / totalKm : null,
    years, comparisons, trend, weekdayRuns, weekdayKm, favoriteWeekday, dayPartRuns, favoriteDayPart, weekendShare, heatmap, heatmapMonths,
    heatmapKm: heatmapDays.reduce((sum, cell) => sum + cell.km, 0), heatmapRunDays: heatmapDays.filter((cell) => cell.km > 0).length,
    streaks: {
      currentDays: currentStreak(runDays, today), longestDays: longestStreak(runDays),
      currentWeeks: currentStreak(weekIdxs, weekIndex(today)), longestWeeks: longestStreak(weekIdxs),
      longestBreak: { days: longestBreak.days, from: dayText(longestBreak.from), to: dayText(longestBreak.to) },
      thisYearRunDays: thisYear.runDays, thisYearShare: daysThisYear > 0 ? thisYear.runDays / daysThisYear : 0,
    },
    records: {
      longest: record(longest), longestTime: record(longestTime), climb: climb.elev > 0 ? record(climb) : null, fastest5k: record(fastestFrom(5)), fastest10k: record(fastestFrom(10)),
      bestDay: bestDay && { day: dayText(Number(bestDay.key)), km: bestDay.km },
      bestWeek: bestWeek && { from: dayText(Number(bestWeek.key) * 7 - 3), km: bestWeek.km },
      bestMonth: bestMonth && { month: String(bestMonth.key), km: bestMonth.km },
    },
    buckets, journey,
    fun: { marathons: totalKm / 42.195, everests: totalElev / 8849, daysOnTheMove: totalTimeS / 86_400, earthPct: (totalKm / 40075) * 100 },
    persona,
  };
}

export type RunStats = NonNullable<ReturnType<typeof buildRunStats>>;
