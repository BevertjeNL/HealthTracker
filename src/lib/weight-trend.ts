import type { ChartPoint } from "./chart-range";

const DAY_MS = 24 * 60 * 60 * 1000;
const RADIUS_DAYS = 3;

/** A centered seven-day trend, calculated only at dates with a real measurement. */
export function smoothWeightPoints(points: ChartPoint[]): ChartPoint[] {
  const measured = points
    .filter((point): point is { date: string; value: number } => point.value != null)
    .map((point) => ({ ...point, day: Date.parse(`${point.date.slice(0, 10)}T12:00:00Z`) / DAY_MS }))
    .sort((a, b) => a.day - b.day);

  return measured.map((point) => {
    let weightedSum = 0;
    let totalWeight = 0;
    let count = 0;
    for (const neighbor of measured) {
      const distance = Math.abs(neighbor.day - point.day);
      if (distance > RADIUS_DAYS) continue;
      const weight = RADIUS_DAYS + 1 - distance;
      weightedSum += neighbor.value * weight;
      totalWeight += weight;
      count++;
    }
    return { date: point.date, value: count >= 3 ? weightedSum / totalWeight : point.value };
  });
}
