export type RecoveryMetricKey =
  | "hrvMs"
  | "restingHeartRate"
  | "cardioRecovery1m"
  | "walkingHeartRateAverage";

export type HealthMetricRow = {
  date: string;
  hrvMs?: number | null;
  restingHeartRate?: number | null;
  cardioRecovery1m?: number | null;
  walkingHeartRateAverage?: number | null;
};

export type RecoverySignal = {
  value: number;
  date: string;
  ageDays: number;
  fresh: boolean;
  baseline: number | null;
  baselineCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_BASELINE_SAMPLES = 5;

const VALID_RANGES: Record<RecoveryMetricKey, { min: number; max: number }> = {
  hrvMs: { min: 1, max: 300 },
  restingHeartRate: { min: 25, max: 220 },
  cardioRecovery1m: { min: 1, max: 150 },
  walkingHeartRateAverage: { min: 30, max: 220 },
};

export function dayDifference(later: string, earlier: string) {
  return Math.max(0, Math.floor(
    (new Date(`${later}T12:00:00Z`).getTime() - new Date(`${earlier}T12:00:00Z`).getTime()) / DAY_MS,
  ));
}

export function isUsableRecoveryValue(key: RecoveryMetricKey, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return false;
  const range = VALID_RANGES[key];
  return value >= range.min && value <= range.max;
}

export function recoveryTrend(rows: HealthMetricRow[], key: RecoveryMetricKey) {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, value: isUsableRecoveryValue(key, row[key]) ? row[key]! : null }));
}

export function latestRecoverySignal(
  rows: HealthMetricRow[],
  key: RecoveryMetricKey,
  today: string,
): RecoverySignal | null {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted.findLast((row) => isUsableRecoveryValue(key, row[key]));
  if (!current) return null;

  const baselineValues = sorted
    .filter((row) => row.date < current.date && isUsableRecoveryValue(key, row[key]))
    .slice(-14)
    .map((row) => row[key]!);
  const baseline = baselineValues.length
    ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
    : null;
  const ageDays = dayDifference(today, current.date);

  return {
    value: current[key]!,
    date: current.date,
    ageDays,
    fresh: ageDays <= 2,
    baseline,
    baselineCount: baselineValues.length,
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function signalScore(key: RecoveryMetricKey, signal: RecoverySignal) {
  if (!signal.fresh || signal.baseline == null || signal.baselineCount < MIN_BASELINE_SAMPLES) return null;
  if (key === "hrvMs" || key === "cardioRecovery1m") {
    return clamp(75 + ((signal.value - signal.baseline) / signal.baseline) * 100, 35, 100);
  }
  return clamp(75 + ((signal.baseline - signal.value) / signal.baseline) * (key === "restingHeartRate" ? 180 : 140), 35, 100);
}

export function buildRecoverySummary(
  rows: HealthMetricRow[],
  today: string,
  trainingLoadScore?: number | null,
) {
  const signals = {
    hrvMs: latestRecoverySignal(rows, "hrvMs", today),
    restingHeartRate: latestRecoverySignal(rows, "restingHeartRate", today),
    cardioRecovery1m: latestRecoverySignal(rows, "cardioRecovery1m", today),
    walkingHeartRateAverage: latestRecoverySignal(rows, "walkingHeartRateAverage", today),
  };
  const recoveryScores = (Object.entries(signals) as Array<[RecoveryMetricKey, RecoverySignal | null]>)
    .flatMap(([key, signal]) => {
      if (!signal) return [];
      const score = signalScore(key, signal);
      return score == null ? [] : [score];
    });
  const freshCount = Object.values(signals).filter((signal) => signal?.fresh).length;

  if (recoveryScores.length < 2) {
    return { signals, score: null, confidence: "onvoldoende" as const, freshCount, scoredSignalCount: recoveryScores.length };
  }

  const parts = trainingLoadScore == null ? recoveryScores : [...recoveryScores, trainingLoadScore];
  return {
    signals,
    score: Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length),
    confidence: recoveryScores.length >= 3 ? "hoog" as const : "middel" as const,
    freshCount,
    scoredSignalCount: recoveryScores.length,
  };
}
