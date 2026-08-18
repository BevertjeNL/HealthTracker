import type { activities, healthMetrics } from "@/db/schema";

type Activity = typeof activities.$inferSelect;
type HealthMetric = typeof healthMetrics.$inferSelect;

export type TrendPoint = { date: string; value: number | null };

/** Simple moving average, centered on the trailing window (last value included). */
export function rollingAverage(points: TrendPoint[], window: number): TrendPoint[] {
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1).map((s) => s.value);
    const valid = slice.filter((v): v is number => v !== null && v !== undefined);
    return { date: p.date, value: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null };
  });
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export type WeightSummary = {
  current: number | null;
  deltaKg: number | null;
  deltaPeriodDays: number | null;
  trend: TrendPoint[];
};

/** Weight trend as a 7-day rolling average, plus net change since the earliest reading in range. */
export function weightSummary(metrics: HealthMetric[]): WeightSummary {
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const raw: TrendPoint[] = sorted.map((m) => ({ date: m.date, value: m.weightKg }));
  const trend = rollingAverage(raw, 7);

  const withWeight = sorted.filter((m) => m.weightKg != null);
  if (withWeight.length < 2) {
    return {
      current: withWeight.at(-1)?.weightKg ?? null,
      deltaKg: null,
      deltaPeriodDays: null,
      trend,
    };
  }
  const first = withWeight[0];
  const last = withWeight.at(-1)!;
  const days = Math.round(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    current: last.weightKg,
    deltaKg: last.weightKg! - first.weightKg!,
    deltaPeriodDays: days,
    trend,
  };
}

export type RunPerformanceSummary = {
  paceTrend: TrendPoint[];
  vo2Trend: TrendPoint[];
  recentAvgPace: number | null;
  priorAvgPace: number | null;
  paceDeltaMinPerKm: number | null;
  efficiencyTrend: TrendPoint[]; // seconds per km per bpm — lower = more efficient
};

/** Compares the most recent block of runs against the prior block, and tracks aerobic efficiency (pace vs HR). */
export function runPerformanceSummary(runs: Activity[], metrics: HealthMetric[]): RunPerformanceSummary {
  const sorted = [...runs].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const paceTrend: TrendPoint[] = sorted.map((r) => ({
    date: r.startDate.toISOString(),
    value: r.avgPaceMinPerKm,
  }));

  const vo2ByDate = new Map(metrics.filter((m) => m.vo2Max != null).map((m) => [m.date, m.vo2Max!]));
  const vo2Trend: TrendPoint[] = [...vo2ByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  const withPace = sorted.filter((r) => r.avgPaceMinPerKm != null);
  const blockSize = Math.min(4, Math.floor(withPace.length / 2) || 0);
  let recentAvgPace: number | null = null;
  let priorAvgPace: number | null = null;
  if (blockSize > 0) {
    recentAvgPace = avg(withPace.slice(-blockSize).map((r) => r.avgPaceMinPerKm!));
    priorAvgPace = avg(withPace.slice(-2 * blockSize, -blockSize).map((r) => r.avgPaceMinPerKm!));
  }

  const efficiencyTrend: TrendPoint[] = sorted
    .filter((r) => r.avgPaceMinPerKm != null && r.avgHeartRate != null)
    .map((r) => ({
      date: r.startDate.toISOString(),
      value: (r.avgPaceMinPerKm! * 60) / r.avgHeartRate!,
    }));

  return {
    paceTrend,
    vo2Trend,
    recentAvgPace,
    priorAvgPace,
    paceDeltaMinPerKm:
      recentAvgPace != null && priorAvgPace != null ? recentAvgPace - priorAvgPace : null,
    efficiencyTrend,
  };
}

export type Insight = {
  id: string;
  status: "good" | "warning" | "neutral";
  text: string;
};

/** Rule-based coaching insights — deliberately simple (small sample sizes) rather than statistically fitted. */
export function buildInsights(runs: Activity[], metrics: HealthMetric[]): Insight[] {
  const insights: Insight[] = [];
  const metricsByDate = new Map(metrics.map((m) => [m.date, m]));

  const runsWithPrep = runs
    .map((r) => {
      const dayBefore = new Date(r.startDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const key = dayBefore.toISOString().slice(0, 10);
      const prep = metricsByDate.get(key);
      return { run: r, prep };
    })
    .filter((x) => x.run.avgPaceMinPerKm != null);

  // Sleep vs. pace: split runs into faster/slower half, compare prior-night sleep.
  const withSleep = runsWithPrep.filter((x) => x.prep?.sleepHours != null);
  if (withSleep.length >= 4) {
    const byPace = [...withSleep].sort((a, b) => a.run.avgPaceMinPerKm! - b.run.avgPaceMinPerKm!);
    const half = Math.floor(byPace.length / 2);
    const faster = byPace.slice(0, half);
    const slower = byPace.slice(-half);
    const fasterSleep = avg(faster.map((x) => x.prep!.sleepHours!));
    const slowerSleep = avg(slower.map((x) => x.prep!.sleepHours!));
    if (fasterSleep != null && slowerSleep != null && Math.abs(fasterSleep - slowerSleep) >= 0.4) {
      const better = fasterSleep > slowerSleep;
      insights.push({
        id: "sleep-pace",
        status: better ? "good" : "warning",
        text: better
          ? `Je snelste runs volgden op nachten met gemiddeld ${fasterSleep.toFixed(1)}u slaap, tegenover ${slowerSleep.toFixed(1)}u voor je tragere runs — slaap lijkt hier het verschil te maken.`
          : `Opvallend: je snelste runs volgden juist op kortere nachten (${fasterSleep.toFixed(1)}u) dan je tragere runs (${slowerSleep.toFixed(1)}u) — waarschijnlijk ruis door de kleine dataset, geen conclusie te trekken.`,
      });
    }
  }

  // HRV vs. pace, same split idea.
  const withHrv = runsWithPrep.filter((x) => x.prep?.hrvMs != null);
  if (withHrv.length >= 4) {
    const byPace = [...withHrv].sort((a, b) => a.run.avgPaceMinPerKm! - b.run.avgPaceMinPerKm!);
    const half = Math.floor(byPace.length / 2);
    const faster = byPace.slice(0, half);
    const slower = byPace.slice(-half);
    const fasterHrv = avg(faster.map((x) => x.prep!.hrvMs!));
    const slowerHrv = avg(slower.map((x) => x.prep!.hrvMs!));
    if (fasterHrv != null && slowerHrv != null && Math.abs(fasterHrv - slowerHrv) >= 3) {
      const better = fasterHrv > slowerHrv;
      insights.push({
        id: "hrv-pace",
        status: better ? "good" : "neutral",
        text: better
          ? `Bij een hogere HRV de ochtend ervoor (${Math.round(fasterHrv)}ms vs ${Math.round(slowerHrv)}ms) liep je gemiddeld sneller — een teken dat je herstel je runkwaliteit stuurt.`
          : `Je HRV was lager voor je snellere runs (${Math.round(fasterHrv)}ms vs ${Math.round(slowerHrv)}ms) — geen duidelijk verband, of te weinig data om dit hard te maken.`,
      });
    }
  }

  // VO2max direction.
  const vo2Points = [...metrics].filter((m) => m.vo2Max != null).sort((a, b) => a.date.localeCompare(b.date));
  if (vo2Points.length >= 2) {
    const delta = vo2Points.at(-1)!.vo2Max! - vo2Points[0].vo2Max!;
    if (Math.abs(delta) >= 0.3) {
      insights.push({
        id: "vo2-trend",
        status: delta > 0 ? "good" : "warning",
        text:
          delta > 0
            ? `Je VO2max steeg van ${vo2Points[0].vo2Max!.toFixed(1)} naar ${vo2Points.at(-1)!.vo2Max!.toFixed(1)} — je duurvermogen verbetert.`
            : `Je VO2max daalde van ${vo2Points[0].vo2Max!.toFixed(1)} naar ${vo2Points.at(-1)!.vo2Max!.toFixed(1)} — mogelijk tijd voor meer duurtraining of rust.`,
      });
    }
  }

  // Weight vs. pace trend (very rough, directional only).
  const weightPoints = [...metrics].filter((m) => m.weightKg != null).sort((a, b) => a.date.localeCompare(b.date));
  const paceRuns = [...runs].filter((r) => r.avgPaceMinPerKm != null).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (weightPoints.length >= 5 && paceRuns.length >= 4) {
    const weightDelta = weightPoints.at(-1)!.weightKg! - weightPoints[0].weightKg!;
    const half = Math.floor(paceRuns.length / 2);
    const paceDelta =
      avg(paceRuns.slice(-half).map((r) => r.avgPaceMinPerKm!))! -
      avg(paceRuns.slice(0, half).map((r) => r.avgPaceMinPerKm!))!;
    if (weightDelta <= -0.5 && paceDelta < -0.05) {
      insights.push({
        id: "weight-pace",
        status: "good",
        text: `Sinds je ${Math.abs(weightDelta).toFixed(1)}kg bent afgevallen, is je gemiddelde tempo ook verbeterd — dat past bij elkaar.`,
      });
    } else if (weightDelta <= -0.5 && Math.abs(paceDelta) < 0.05) {
      insights.push({
        id: "weight-pace",
        status: "neutral",
        text: `Je bent ${Math.abs(weightDelta).toFixed(1)}kg afgevallen, maar je tempo is nog niet merkbaar veranderd — dat kan nog komen, of het gewichtsverlies zit nog niet in je looptechniek/kracht verwerkt.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: "not-enough-data",
      status: "neutral",
      text: "Nog niet genoeg data voor betrouwbare inzichten — bij ~1 run per week duurt het een paar maanden voor patronen zichtbaar worden.",
    });
  }

  return insights;
}
