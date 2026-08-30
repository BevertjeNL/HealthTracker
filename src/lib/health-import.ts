export type HealthMetricValues = {
  restingHeartRate: number | null;
  hrvMs: number | null;
  cardioRecovery1m: number | null;
  walkingHeartRateAverage: number | null;
  vo2Max: number | null;
  steps: number | null;
  activeEnergyKcal: number | null;
  weightKg: number | null;
  oxygenSaturationPct: number | null;
  respiratoryRate: number | null;
  exerciseMinutes: number | null;
  daylightMinutes: number | null;
  walkingSpeedKmh: number | null;
  walkingSteadinessPct: number | null;
  sixMinuteWalkDistanceM: number | null;
  runningPowerW: number | null;
  runningStrideLengthM: number | null;
  runningVerticalOscillationCm: number | null;
  runningGroundContactTimeMs: number | null;
};

type Column = keyof HealthMetricValues;
type Aggregation = "sum" | "avg" | "last";

export const HEALTH_METRIC_MAP: Record<string, { column: Column; aggregation: Aggregation }> = {
  resting_heart_rate: { column: "restingHeartRate", aggregation: "avg" },
  heart_rate_variability: { column: "hrvMs", aggregation: "avg" },
  cardio_recovery: { column: "cardioRecovery1m", aggregation: "avg" },
  heart_rate_recovery_one_minute: { column: "cardioRecovery1m", aggregation: "avg" },
  walking_heart_rate_average: { column: "walkingHeartRateAverage", aggregation: "avg" },
  vo2_max: { column: "vo2Max", aggregation: "last" },
  step_count: { column: "steps", aggregation: "sum" },
  active_energy: { column: "activeEnergyKcal", aggregation: "sum" },
  weight_body_mass: { column: "weightKg", aggregation: "last" },
  "weight_&_body_mass": { column: "weightKg", aggregation: "last" },
  oxygen_saturation: { column: "oxygenSaturationPct", aggregation: "avg" },
  respiratory_rate: { column: "respiratoryRate", aggregation: "avg" },
  exercise_minutes: { column: "exerciseMinutes", aggregation: "sum" },
  daylight_minutes: { column: "daylightMinutes", aggregation: "sum" },
  walking_speed: { column: "walkingSpeedKmh", aggregation: "avg" },
  walking_steadiness: { column: "walkingSteadinessPct", aggregation: "avg" },
  six_minute_walk_distance: { column: "sixMinuteWalkDistanceM", aggregation: "last" },
  running_power: { column: "runningPowerW", aggregation: "avg" },
  running_stride_length: { column: "runningStrideLengthM", aggregation: "avg" },
  running_vertical_oscillation: { column: "runningVerticalOscillationCm", aggregation: "avg" },
  running_ground_contact_time: { column: "runningGroundContactTimeMs", aggregation: "avg" },
};

export const RECOMMENDED_HEALTH_METRICS = [
  "heart_rate_variability",
  "resting_heart_rate",
  "cardio_recovery",
  "walking_heart_rate_average",
  "vo2_max",
  "step_count",
  "active_energy",
  "weight_body_mass",
] as const;

type DailyHealthRow = {
  date: string;
  values: Partial<HealthMetricValues>;
};

export type ParsedHealthPayload = {
  source: "apple-shortcuts" | "health-auto-export";
  rows: DailyHealthRow[];
  receivedMetrics: string[];
  importedMetrics: string[];
  ignoredMetrics: string[];
};

export class InvalidHealthPayloadError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function dayKey(value: unknown) {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return isCalendarDate(date) ? date : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)(?:\s*(?:ms|bpm|kcal|kg|ml\/kg\/min|count|%|min|km\/h|m|w|cm|ademhalingen\/min))?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

const VALID_METRIC_RANGES: Record<string, { min: number; max: number }> = {
  heart_rate_variability: { min: 1, max: 300 },
  resting_heart_rate: { min: 25, max: 220 },
  cardio_recovery: { min: 1, max: 150 },
  heart_rate_recovery_one_minute: { min: 1, max: 150 },
  walking_heart_rate_average: { min: 30, max: 220 },
  vo2_max: { min: 5, max: 100 },
  step_count: { min: 0, max: 200_000 },
  active_energy: { min: 0, max: 10_000 },
  weight_body_mass: { min: 20, max: 400 },
  "weight_&_body_mass": { min: 20, max: 400 },
  oxygen_saturation: { min: 70, max: 100 },
  respiratory_rate: { min: 4, max: 60 },
  exercise_minutes: { min: 0, max: 1_440 },
  daylight_minutes: { min: 0, max: 1_440 },
  walking_speed: { min: 0.5, max: 15 },
  walking_steadiness: { min: 0, max: 100 },
  six_minute_walk_distance: { min: 10, max: 2_000 },
  running_power: { min: 20, max: 1_500 },
  running_stride_length: { min: 0.2, max: 3 },
  running_vertical_oscillation: { min: 2, max: 25 },
  running_ground_contact_time: { min: 80, max: 700 },
};

export function isValidHealthMetricValue(metricName: string, value: number) {
  const range = VALID_METRIC_RANGES[metricName];
  return range ? value >= range.min && value <= range.max : false;
}

export function normalizeHealthMetricValue(
  metricName: string,
  units: string | undefined,
  value: number,
) {
  const normalizedUnits = units?.trim().toLowerCase();
  if (metricName === "active_energy" && normalizedUnits === "kj") {
    return value / 4.184;
  }
  if (
    (metricName === "weight_body_mass" || metricName === "weight_&_body_mass") &&
    (normalizedUnits === "lb" || normalizedUnits === "lbs")
  ) {
    return value * 0.45359237;
  }
  if (
    (metricName === "oxygen_saturation" || metricName === "walking_steadiness") &&
    (normalizedUnits === "%" || normalizedUnits == null) &&
    value <= 1
  ) {
    return value * 100;
  }
  return value;
}

function reduce(values: number[], aggregation: Aggregation) {
  if (aggregation === "sum") return values.reduce((total, value) => total + value, 0);
  if (aggregation === "avg") return values.reduce((total, value) => total + value, 0) / values.length;
  return values[values.length - 1];
}

function metricLists(names: string[]) {
  const receivedMetrics = [...new Set(names)].sort();
  return {
    receivedMetrics,
    importedMetrics: receivedMetrics.filter((name) => name in HEALTH_METRIC_MAP),
    ignoredMetrics: receivedMetrics.filter((name) => !(name in HEALTH_METRIC_MAP)),
  };
}

function parseShortcutPayload(payload: Record<string, unknown>): ParsedHealthPayload {
  if (!isCalendarDate(payload.date)) {
    throw new InvalidHealthPayloadError("Apple Shortcuts payload requires date in YYYY-MM-DD format");
  }

  const nestedMetrics = isRecord(payload.metrics) ? payload.metrics : null;
  const metricFields = nestedMetrics ?? Object.fromEntries(
    Object.entries(payload).filter(([name]) => name !== "source" && name !== "date"),
  );
  const names = Object.keys(metricFields).filter((name) => name !== "metrics");
  const lists = metricLists(names);
  const values: Partial<HealthMetricValues> = {};

  for (const metricName of lists.importedMetrics) {
    const value = finiteNumber(metricFields[metricName]);
    if (value === null) continue;
    const normalizedValue = normalizeHealthMetricValue(metricName, undefined, value);
    if (!isValidHealthMetricValue(metricName, normalizedValue)) continue;
    values[HEALTH_METRIC_MAP[metricName].column] = normalizedValue;
  }

  return {
    source: "apple-shortcuts",
    rows: Object.keys(values).length > 0 ? [{ date: payload.date, values }] : [],
    ...lists,
  };
}

function parseHealthAutoExportPayload(payload: Record<string, unknown>): ParsedHealthPayload {
  const data = payload.data;
  if (!isRecord(data) || !Array.isArray(data.metrics)) {
    throw new InvalidHealthPayloadError("Health Auto Export payload requires data.metrics");
  }

  const metrics = data.metrics.filter(isRecord);
  const lists = metricLists(metrics.flatMap((metric) => typeof metric.name === "string" ? [metric.name] : []));
  const buckets = new Map<string, Partial<Record<Column, number[]>>>();

  for (const metric of metrics) {
    if (typeof metric.name !== "string" || !Array.isArray(metric.data)) continue;
    const mapping = HEALTH_METRIC_MAP[metric.name];
    if (!mapping) continue;
    const units = typeof metric.units === "string" ? metric.units : undefined;
    const points = metric.data.filter(isRecord).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    for (const point of points) {
      const date = dayKey(point.date);
      const value = finiteNumber(point.qty ?? point.Avg ?? point.value);
      if (!date || value === null) continue;
      const normalizedValue = normalizeHealthMetricValue(metric.name, units, value);
      if (!isValidHealthMetricValue(metric.name, normalizedValue)) continue;
      const dayBucket = buckets.get(date) ?? {};
      const values = dayBucket[mapping.column] ?? [];
      values.push(normalizedValue);
      dayBucket[mapping.column] = values;
      buckets.set(date, dayBucket);
    }
  }

  const rows: DailyHealthRow[] = [];
  for (const [date, bucket] of buckets) {
    const values: Partial<HealthMetricValues> = {};
    for (const mapping of Object.values(HEALTH_METRIC_MAP)) {
      const samples = bucket[mapping.column];
      if (samples?.length) values[mapping.column] = reduce(samples, mapping.aggregation);
    }
    if (Object.keys(values).length > 0) rows.push({ date, values });
  }

  return { source: "health-auto-export", rows, ...lists };
}

export function parseHealthPayload(payload: unknown): ParsedHealthPayload {
  if (!isRecord(payload)) throw new InvalidHealthPayloadError("Payload must be a JSON object");
  if (payload.source === "apple-shortcuts") return parseShortcutPayload(payload);
  return parseHealthAutoExportPayload(payload);
}
