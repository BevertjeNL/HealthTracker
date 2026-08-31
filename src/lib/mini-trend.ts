export type MiniTrendPoint = { date: string; value: number | null };

export type MiniTrendSeries = {
  points: Array<{ date: string; value: number }>;
  first: number | null;
  latest: number | null;
  change: number | null;
  sampleCount: number;
};

type MiniTrendOptions = {
  endDate: string;
  windowDays: number;
  bucketDays?: number;
  aggregation?: "average" | "sum";
  includeEmptyBuckets?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateMs(date: string) {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Turns raw, possibly sparse measurements into a truthful recent mini trend.
 * The calendar window prevents "last N samples" from masquerading as recent data.
 */
export function buildMiniTrend(points: MiniTrendPoint[], options: MiniTrendOptions): MiniTrendSeries {
  const bucketDays = Math.max(0, Math.floor(options.bucketDays ?? 0));
  const end = dateMs(options.endDate);
  const start = end - (options.windowDays - 1) * DAY_MS;
  const valid = points
    .filter((point): point is { date: string; value: number } => (
      point.value != null
      && Number.isFinite(point.value)
      && dateMs(point.date) >= start
      && dateMs(point.date) <= end
    ))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!bucketDays) {
    const first = valid.at(0)?.value ?? null;
    const latest = valid.at(-1)?.value ?? null;
    return {
      points: valid,
      first,
      latest,
      change: first != null && latest != null ? latest - first : null,
      sampleCount: valid.length,
    };
  }

  const bucketCount = Math.ceil(options.windowDays / bucketDays);
  const buckets = Array.from({ length: bucketCount }, () => [] as number[]);
  for (const point of valid) {
    const bucketIndex = Math.min(bucketCount - 1, Math.floor((dateMs(point.date) - start) / (bucketDays * DAY_MS)));
    buckets[bucketIndex].push(point.value);
  }

  const aggregated = buckets.flatMap((values, index) => {
    if (!values.length && !options.includeEmptyBuckets) return [];
    const value = options.aggregation === "sum"
      ? values.reduce((sum, item) => sum + item, 0)
      : values.reduce((sum, item) => sum + item, 0) / values.length;
    const bucketEnd = Math.min(end, start + ((index + 1) * bucketDays - 1) * DAY_MS);
    return [{ date: isoDate(bucketEnd), value }];
  });
  const first = aggregated.at(0)?.value ?? null;
  const latest = aggregated.at(-1)?.value ?? null;

  return {
    points: aggregated,
    first,
    latest,
    change: first != null && latest != null ? latest - first : null,
    sampleCount: valid.length,
  };
}
