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

export type ChartPreset = 30 | 90 | 365 | "all";
export type ChartSettings = {
  preset: ChartPreset | null;
  start: string | null;
  end: string | null;
  lower: number | null;
  upper: number | null;
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = { preset: "all", start: null, end: null, lower: null, upper: null };
export const MIN_CHART_SPAN_DAYS = 7;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function addChartDays(date: string, days: number) {
  const result = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function chartDaysBetween(from: string, to: string) {
  const start = new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime();
  const end = new Date(`${to.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((end - start) / DAY_MS);
}

export function parseChartSettings(raw: string | null): ChartSettings {
  if (!raw) return DEFAULT_CHART_SETTINGS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const preset = value.preset === 30 || value.preset === 90 || value.preset === 365 || value.preset === "all" ? value.preset : null;
    const start = typeof value.start === "string" && DATE_PATTERN.test(value.start) ? value.start : null;
    const end = typeof value.end === "string" && DATE_PATTERN.test(value.end) ? value.end : null;
    const lower = typeof value.lower === "number" && Number.isFinite(value.lower) ? value.lower : null;
    const upper = typeof value.upper === "number" && Number.isFinite(value.upper) ? value.upper : null;
    const validY = !(lower != null && upper != null && lower >= upper);
    const validX = start != null && end != null && start < end;
    if (preset == null && !validX) return { ...DEFAULT_CHART_SETTINGS, lower: validY ? lower : null, upper: validY ? upper : null };
    return { preset, start: validX ? start : null, end: validX ? end : null, lower: validY ? lower : null, upper: validY ? upper : null };
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

/** Resolves the saved settings to a concrete [start, end] window that always lies inside [earliest, today]. */
export function resolveChartWindow(settings: ChartSettings, earliest: string, today: string): [string, string] {
  if (typeof settings.preset === "number") return [addChartDays(today, -(settings.preset - 1)), today];
  if (settings.preset === "all" || settings.start == null || settings.end == null) return [earliest, today];
  let end = settings.end > today ? today : settings.end;
  let start = settings.start < earliest ? earliest : settings.start;
  if (chartDaysBetween(start, end) < MIN_CHART_SPAN_DAYS) {
    start = addChartDays(end, -MIN_CHART_SPAN_DAYS);
    if (start < earliest) {
      start = earliest;
      end = addChartDays(start, MIN_CHART_SPAN_DAYS) > today ? today : addChartDays(start, MIN_CHART_SPAN_DAYS);
    }
  }
  return [start, end];
}

/** Slider bounds for the value axis: all data plus some air, widened to include any saved manual limits. */
export function valueSliderBounds(points: ChartPoint[], lower: number | null, upper: number | null): [number, number] | null {
  const values = points.flatMap((point) => point.value == null ? [] : [point.value]);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || 1;
  const floor = Math.min(min - pad, lower ?? Infinity);
  const ceil = Math.max(max + pad, upper ?? -Infinity);
  return [Math.floor(floor * 10) / 10, Math.ceil(ceil * 10) / 10];
}
