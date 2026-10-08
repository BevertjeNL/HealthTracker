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

export function selectChartWindow(points: ChartPoint[], start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return null;
  return points.filter((point) => point.date.slice(0, 10) >= start && point.date.slice(0, 10) <= end);
}

export function manualValueDomain(points: ChartPoint[], lower: string, upper: string) {
  const values = points.flatMap((point) => point.value == null ? [] : [point.value]);
  if (!values.length) return { domain: undefined, error: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * .12 || 1;
  const parsedLower = lower.trim() === "" ? min - padding : Number(lower);
  const parsedUpper = upper.trim() === "" ? max + padding : Number(upper);
  if (!Number.isFinite(parsedLower) || !Number.isFinite(parsedUpper) || parsedLower >= parsedUpper) {
    return { domain: undefined, error: "De ondergrens moet lager zijn dan de bovengrens." };
  }
  return { domain: [parsedLower, parsedUpper] as [number, number], error: null };
}
