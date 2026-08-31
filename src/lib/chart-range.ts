export type ChartPoint = { date: string; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function chartSpanDays(domain: [string, string]) {
  const start = new Date(`${domain[0].slice(0, 10)}T12:00:00Z`).getTime();
  const end = new Date(`${domain[1].slice(0, 10)}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

export function formatChartTick(timestamp: number, spanDays: number) {
  const date = new Date(timestamp);
  if (spanDays <= 120) {
    return date.toLocaleDateString("nl-NL", { timeZone: "UTC", day: "numeric", month: "short" });
  }
  if (spanDays <= 330) {
    return date.toLocaleDateString("nl-NL", { timeZone: "UTC", month: "short" });
  }
  if (spanDays <= 900) {
    const month = date.toLocaleDateString("nl-NL", { timeZone: "UTC", month: "short" });
    return `${month} ’${String(date.getUTCFullYear()).slice(-2)}`;
  }
  return String(date.getUTCFullYear());
}

export function buildChartTicks(domain: [string, string], targetCount = 5) {
  const start = new Date(`${domain[0].slice(0, 10)}T12:00:00Z`).getTime();
  const end = new Date(`${domain[1].slice(0, 10)}T12:00:00Z`).getTime();
  const spanDays = chartSpanDays(domain);
  const candidates = Array.from({ length: targetCount }, (_, index) => (
    start + ((end - start) * index) / (targetCount - 1)
  ));
  const seen = new Set<string>();
  return candidates.filter((timestamp) => {
    const label = formatChartTick(timestamp, spanDays);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export function summarizeChartPoints(points: ChartPoint[]) {
  const values = points.flatMap((point) => point.value == null ? [] : [point.value]);
  if (!values.length) return { first: null, latest: null, minimum: null, maximum: null, average: null };
  return {
    first: values[0],
    latest: values.at(-1)!,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}
