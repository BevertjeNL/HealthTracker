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
  title: string;
  text: string;
  recommendation: string;
  confidence: "hoog" | "middel" | "laag";
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateMs(date: string) {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function runKm(runs: Activity[]) {
  return runs.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
}

function percentChange(current: number, baseline: number) {
  return baseline === 0 ? 0 : ((current - baseline) / baseline) * 100;
}

/**
 * Rule-based personal coaching insights. Comparisons use the athlete's own
 * recent baseline and expose sample size/uncertainty instead of medical norms.
 */
export function buildInsights(
  runs: Activity[],
  metrics: HealthMetric[],
  now = new Date(),
): Insight[] {
  const insights: Insight[] = [];
  const nowMs = now.getTime();
  const sortedRuns = [...runs].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date));

  const latestMetric = sortedMetrics.at(-1);
  if (latestMetric) {
    const ageDays = Math.max(0, Math.floor((nowMs - dateMs(latestMetric.date)) / DAY_MS));
    if (ageDays > 2) {
      insights.push({
        id: "health-sync-stale",
        status: "warning",
        title: "Apple Health loopt achter",
        text: `De laatste Health-dag is ${latestMetric.date} (${ageDays} dagen geleden). Een actuele herstelconclusie zou daardoor schijnprecisie zijn.`,
        recommendation: "Controleer de persoonlijke Apple Opdrachten-automatisering en voer de opdracht één keer handmatig uit.",
        confidence: "hoog",
      });
    }
  }

  const recoveryRows = sortedMetrics.filter(
    (metric) => metric.hrvMs != null || metric.restingHeartRate != null,
  );
  const recentRecovery = recoveryRows.slice(-3);
  const recoveryBaseline = recoveryRows.slice(-17, -3);
  const recentHrv = avg(recentRecovery.flatMap((metric) => metric.hrvMs == null ? [] : [metric.hrvMs]));
  const baselineHrv = avg(recoveryBaseline.flatMap((metric) => metric.hrvMs == null ? [] : [metric.hrvMs]));
  const recentRhr = avg(recentRecovery.flatMap((metric) => metric.restingHeartRate == null ? [] : [metric.restingHeartRate]));
  const baselineRhr = avg(recoveryBaseline.flatMap((metric) => metric.restingHeartRate == null ? [] : [metric.restingHeartRate]));

  if (
    recentRecovery.length >= 2 &&
    recoveryBaseline.length >= 5 &&
    recentHrv != null && baselineHrv != null &&
    recentRhr != null && baselineRhr != null
  ) {
    const hrvChange = percentChange(recentHrv, baselineHrv);
    const rhrChange = percentChange(recentRhr, baselineRhr);
    const strained = hrvChange <= -10 && rhrChange >= 3;
    const positive = hrvChange >= 8 && rhrChange <= 1;
    insights.push({
      id: "recovery-baseline",
      status: strained ? "warning" : positive ? "good" : "neutral",
      title: strained ? "Meerdere herstelsignalen staan onder druk" : positive ? "Herstel beweegt gunstig" : "Herstel is gemengd",
      text: `Je laatste ${recentRecovery.length} metingen tonen HRV ${Math.abs(hrvChange).toFixed(0)}% ${hrvChange >= 0 ? "boven" : "onder"} en rusthartslag ${Math.abs(rhrChange).toFixed(0)}% ${rhrChange >= 0 ? "boven" : "onder"} je eerdere basislijn.`,
      recommendation: strained
        ? "Kies maximaal een rustige duurloop en herbeoordeel morgen; stapel nu geen intensieve dagen."
        : positive
          ? "Er is ruimte voor kwaliteit, mits je benen subjectief ook goed aanvoelen."
          : "Houd de training beheerst totdat HRV en rusthartslag dezelfde richting bevestigen.",
      confidence: recoveryBaseline.length >= 10 ? "middel" : "laag",
    });
  }

  const trendSignals = [
    {
      id: "cardio-recovery-trend",
      title: "Cardioherstel na inspanning",
      values: sortedMetrics.flatMap((metric) => metric.cardioRecovery1m == null ? [] : [metric.cardioRecovery1m]),
      higherIsBetter: true,
      unit: "bpm",
    },
    {
      id: "walking-heart-rate-trend",
      title: "Gemiddelde wandelhartslag",
      values: sortedMetrics.flatMap((metric) => metric.walkingHeartRateAverage == null ? [] : [metric.walkingHeartRateAverage]),
      higherIsBetter: false,
      unit: "bpm",
    },
  ];

  for (const signal of trendSignals) {
    if (signal.values.length < 8) continue;
    const recent = avg(signal.values.slice(-3))!;
    const baseline = avg(signal.values.slice(-17, -3))!;
    const change = percentChange(recent, baseline);
    const favourable = signal.higherIsBetter ? change >= 5 : change <= -3;
    const unfavourable = signal.higherIsBetter ? change <= -8 : change >= 4;
    insights.push({
      id: signal.id,
      status: favourable ? "good" : unfavourable ? "warning" : "neutral",
      title: signal.title,
      text: `De laatste 3 metingen gemiddeld ${recent.toFixed(0)} ${signal.unit}, tegenover ${baseline.toFixed(0)} ${signal.unit} in de eerdere basislijn (${Math.abs(change).toFixed(0)}% ${change >= 0 ? "hoger" : "lager"}).`,
      recommendation: favourable
        ? "Dit signaal ondersteunt je huidige trainingsopbouw; blijf het naast HRV en rusthartslag beoordelen."
        : unfavourable
          ? "Houd de eerstvolgende training rustig en kijk of dit signaal meerdere dagen aanhoudt."
          : "Nog geen duidelijke verschuiving; verzamel verder voordat je de training hierop aanpast.",
      confidence: signal.values.length >= 14 ? "middel" : "laag",
    });
  }

  const recentRuns = sortedRuns.filter((run) => run.startDate.getTime() >= nowMs - 7 * DAY_MS);
  const priorRuns = sortedRuns.filter((run) => {
    const time = run.startDate.getTime();
    return time >= nowMs - 14 * DAY_MS && time < nowMs - 7 * DAY_MS;
  });
  const recentKm = runKm(recentRuns);
  const priorKm = runKm(priorRuns);
  if (recentKm > 0 || priorKm > 0) {
    const loadChange = priorKm > 0 ? percentChange(recentKm, priorKm) : null;
    const sharpIncrease = loadChange != null && loadChange > 30;
    insights.push({
      id: "training-load",
      status: sharpIncrease ? "warning" : "good",
      title: sharpIncrease ? "Weekbelasting stijgt snel" : "Weekbelasting is beheerst",
      text: loadChange == null
        ? `Je liep ${recentKm.toFixed(1)} km in de laatste 7 dagen; de week ervoor bevatte geen kilometers voor een eerlijke vergelijking.`
        : `Je liep ${recentKm.toFixed(1)} km in de laatste 7 dagen versus ${priorKm.toFixed(1)} km ervoor (${Math.abs(loadChange).toFixed(0)}% ${loadChange >= 0 ? "meer" : "minder"}).`,
      recommendation: sharpIncrease
        ? "Verhoog deze week niet verder en plan minimaal één rustige of vrije dag tussen zware prikkels."
        : "Bouw alleen verder op als herstel en loopgevoel stabiel blijven.",
      confidence: priorKm > 0 ? "hoog" : "laag",
    });
  }

  const efficiencyRuns = sortedRuns.filter(
    (run) => run.avgPaceMinPerKm != null && run.avgHeartRate != null,
  );
  if (efficiencyRuns.length >= 8) {
    const prior = efficiencyRuns.slice(-8, -4);
    const recent = efficiencyRuns.slice(-4);
    const priorEfficiency = avg(prior.map((run) => (run.avgPaceMinPerKm! * 60) / run.avgHeartRate!))!;
    const recentEfficiency = avg(recent.map((run) => (run.avgPaceMinPerKm! * 60) / run.avgHeartRate!))!;
    const improvement = percentChange(priorEfficiency, recentEfficiency);
    insights.push({
      id: "aerobic-efficiency",
      status: improvement >= 2 ? "good" : improvement <= -2 ? "warning" : "neutral",
      title: improvement >= 2 ? "Aerobe efficiëntie verbetert" : improvement <= -2 ? "Lopen kost recent meer hartslag" : "Aerobe efficiëntie is stabiel",
      text: `Over je laatste 4 runs is de verhouding tussen tempo en gemiddelde hartslag ${Math.abs(improvement).toFixed(1)}% ${improvement >= 0 ? "gunstiger" : "ongunstiger"} dan in de 4 runs ervoor.`,
      recommendation: improvement >= 2
        ? "Behoud de huidige rustige basis; die vertaalt zich zichtbaar naar efficiënter lopen."
        : improvement <= -2
          ? "Maak de volgende duurloop echt rustig en let op warmte, heuvels en vermoeidheid voordat je dit als conditiedaling ziet."
          : "Blijf dezelfde soort runs vergelijken; route en intensiteit kunnen dit signaal sterk beïnvloeden.",
      confidence: "middel",
    });
  }

  const fourWeekRuns = sortedRuns.filter((run) => run.startDate.getTime() >= nowMs - 28 * DAY_MS);
  if (fourWeekRuns.length >= 4) {
    const weeklyVolumes = [0, 1, 2, 3].map((week) => runKm(fourWeekRuns.filter((run) => {
      const age = nowMs - run.startDate.getTime();
      return age >= week * 7 * DAY_MS && age < (week + 1) * 7 * DAY_MS;
    })));
    const meanVolume = avg(weeklyVolumes)!;
    const variance = avg(weeklyVolumes.map((volume) => (volume - meanVolume) ** 2)) ?? 0;
    const variation = meanVolume > 0 ? Math.sqrt(variance) / meanVolume : 0;
    const activeWeeks = weeklyVolumes.filter((volume) => volume > 0).length;
    const lowFrequency = fourWeekRuns.length < 7;
    const consistent = activeWeeks >= 3 && variation <= 0.65;
    insights.push({
      id: "consistency",
      status: !consistent ? "warning" : lowFrequency ? "neutral" : "good",
      title: !consistent
        ? "Je trainingsweken verschillen sterk"
        : lowFrequency
          ? "Regelmatig, maar weinig loopmomenten"
          : "Je trainingsritme is redelijk constant",
      text: `${fourWeekRuns.length} runs verdeeld over ${activeWeeks} van de laatste 4 weken; de weekvolumes zijn ${weeklyVolumes.map((volume) => `${volume.toFixed(1)} km`).join(" · ")}.`,
      recommendation: !consistent
        ? "Kies een haalbaar minimumaantal loopdagen per week en verhoog eerst regelmaat, daarna pas volume."
        : lowFrequency
          ? "Voeg liever een korte, rustige tweede loopprikkel toe dan je langste run of intensiteit verder te verhogen."
          : "Bescherm dit ritme; regelmaat levert doorgaans meer op dan één uitzonderlijk zware week.",
      confidence: "hoog",
    });

    const totalKm = runKm(fourWeekRuns);
    const longestKm = Math.max(...fourWeekRuns.map((run) => (run.distanceM ?? 0) / 1000));
    const longestShare = totalKm > 0 ? longestKm / totalKm : 0;
    if (longestShare > 0.45) {
      insights.push({
        id: "long-run-balance",
        status: "warning",
        title: "Veel volume zit in één lange run",
        text: `Je langste run was ${longestKm.toFixed(1)} km en vormt ${Math.round(longestShare * 100)}% van je totale kilometers in 4 weken.`,
        recommendation: "Verdeel het volume over meer korte, rustige runs voordat je de langste afstand verder uitbouwt.",
        confidence: "hoog",
      });
    }
  }

  const vo2Points = sortedMetrics.filter((metric) => metric.vo2Max != null);
  if (vo2Points.length >= 2) {
    const delta = vo2Points.at(-1)!.vo2Max! - vo2Points[0].vo2Max!;
    if (Math.abs(delta) >= 0.3) {
      insights.push({
        id: "vo2-trend",
        status: delta > 0 ? "good" : "warning",
        title: delta > 0 ? "Cardiofitness beweegt omhoog" : "Cardiofitness beweegt omlaag",
        text: `Apple schat je VO₂max nu op ${vo2Points.at(-1)!.vo2Max!.toFixed(1)}, ${Math.abs(delta).toFixed(1)} punt ${delta > 0 ? "hoger" : "lager"} dan de eerste van ${vo2Points.length} metingen.`,
        recommendation: delta > 0
          ? "Blijf vooral consistent; vier metingen zijn nog te weinig om het tempo van verbetering te voorspellen."
          : "Beoordeel dit pas samen met tempo/hartslag en na meer metingen; één VO₂max-schatting is ruisgevoelig.",
        confidence: vo2Points.length >= 6 ? "middel" : "laag",
      });
    }
  }

  const weightPoints = sortedMetrics.filter((metric) => metric.weightKg != null);
  const paceRuns = sortedRuns.filter((run) => run.avgPaceMinPerKm != null);
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
        title: "Gewicht en tempo bewegen dezelfde kant op",
        text: `Je gewicht daalde ${Math.abs(weightDelta).toFixed(1)} kg terwijl je gemiddelde tempo verbeterde. Dat is een samenhang, geen bewijs dat het gewichtsverlies de verbetering veroorzaakte.`,
        recommendation: "Stuur niet op sneller gewichtsverlies; behoud energie voor herstel en consistente training.",
        confidence: "laag",
      });
    } else if (weightDelta <= -0.5 && Math.abs(paceDelta) < 0.05) {
      insights.push({
        id: "weight-pace",
        status: "neutral",
        title: "Gewichtsverandering vertaalt zich nog niet naar tempo",
        text: `Je gewicht daalde ${Math.abs(weightDelta).toFixed(1)} kg, terwijl het gemiddelde tempo vrijwel gelijk bleef.`,
        recommendation: "Gebruik gewicht alleen als context; trainingskwaliteit en herstel zijn belangrijker stuurvariabelen.",
        confidence: "laag",
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: "not-enough-data",
      status: "neutral",
      title: "Nog onvoldoende vergelijkbare gegevens",
      text: "Er zijn nog niet genoeg recente herstelmetingen en vergelijkbare runs voor een persoonlijke trendanalyse.",
      recommendation: "Laat Health dagelijks exporteren en houd minimaal 4–8 vergelijkbare runs aan voordat je kleine verschillen interpreteert.",
      confidence: "hoog",
    });
  }

  return insights.slice(0, 7);
}
