import { addChartDays, type ChartPoint } from "./chart-range.ts";

export const WEIGHT_PERIOD_WEEKS = [4, 8, 12, 26] as const;
export const MIN_PERIOD_SAMPLES = 3;
export const STABLE_THRESHOLD_KG = 0.3;

export type PeriodAverage = { start: string; end: string; average: number; count: number };

export type WeightPeriods = {
  weeks: number;
  recent: PeriodAverage | null;
  previous: PeriodAverage | null;
  deltaKg: number | null;
  direction: "lower" | "higher" | "stable" | null;
  summary: string;
};

function averageBetween(points: { date: string; value: number }[], start: string, end: string): PeriodAverage | null {
  const inside = points.filter((point) => point.date >= start && point.date <= end);
  if (inside.length < MIN_PERIOD_SAMPLES) return null;
  const average = inside.reduce((sum, point) => sum + point.value, 0) / inside.length;
  return { start, end, average, count: inside.length };
}

/**
 * Compares the average of the last `weeks` weeks with the average of the period before it
 * (twice as long, like Apple Health's "8 weeks versus the previous period").
 * Calendar days are plain strings, so no timezone conversion can shift a measurement.
 * A period with fewer than three measurements gets no average.
 */
export function buildWeightPeriods(points: ChartPoint[], today: string, weeks: number): WeightPeriods {
  const measured = points
    .filter((point): point is { date: string; value: number } => point.value != null)
    .map((point) => ({ date: point.date.slice(0, 10), value: point.value }));

  const recentStart = addChartDays(today, -weeks * 7 + 1);
  const previousEnd = addChartDays(recentStart, -1);
  const previousStart = addChartDays(previousEnd, -weeks * 14 + 1);
  const recent = averageBetween(measured, recentStart, today);
  const previous = averageBetween(measured, previousStart, previousEnd);

  if (!recent) {
    return { weeks, recent, previous, deltaKg: null, direction: null, summary: `Nog te weinig metingen in de laatste ${weeks} weken (minimaal ${MIN_PERIOD_SAMPLES} nodig).` };
  }
  if (!previous) {
    return { weeks, recent, previous, deltaKg: null, direction: null, summary: `Er is nog geen vergelijkingsperiode van ${weeks * 2} weken met genoeg metingen.` };
  }

  const deltaKg = recent.average - previous.average;
  const direction = Math.abs(deltaKg) < STABLE_THRESHOLD_KG ? "stable" : deltaKg < 0 ? "lower" : "higher";
  const summary = direction === "stable"
    ? `Gemiddeld is je gewicht de afgelopen ${weeks} weken stabiel gebleven.`
    : `Gemiddeld is je gewicht de afgelopen ${weeks} weken ${direction === "lower" ? "lager" : "hoger"} geworden.`;
  return { weeks, recent, previous, deltaKg, direction, summary };
}

export function latestWeight(points: ChartPoint[]): { date: string; value: number } | null {
  let latest: { date: string; value: number } | null = null;
  for (const point of points) {
    if (point.value == null) continue;
    const date = point.date.slice(0, 10);
    if (!latest || date > latest.date) latest = { date, value: point.value };
  }
  return latest;
}
