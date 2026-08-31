import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { InsightCard } from "@/components/InsightCard";
import { HealthOverviewTile } from "@/components/HealthOverviewTile";
import { TrendChartsSection } from "@/components/TrendChartsSection";
import { AppLogo } from "@/components/AppLogo";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDate, fmtKm, fmtPace } from "@/lib/format";
import { buildInsights, buildTrainingAdvice, runPerformanceSummary, weightSummary } from "@/lib/insights";
import { buildMiniTrend, type MiniTrendSeries } from "@/lib/mini-trend";
import {
  buildRecoverySummary,
  dayDifference,
  isUsableRecoveryValue,
  recoveryTrend,
  type RecoveryMetricKey,
  type RecoverySignal,
} from "@/lib/recovery";

export const dynamic = "force-dynamic";

type IconName = "arrow" | "bolt" | "pulse" | "run" | "scale" | "trend";
type HealthMetric = typeof healthMetrics.$inferSelect;

type LongTermMetricKey =
  | "oxygenSaturationPct"
  | "respiratoryRate"
  | "exerciseMinutes"
  | "daylightMinutes"
  | "walkingSpeedKmh"
  | "walkingSteadinessPct"
  | "sixMinuteWalkDistanceM"
  | "runningPowerW"
  | "runningStrideLengthM"
  | "runningVerticalOscillationCm"
  | "runningGroundContactTimeMs";

function healthSeries(metrics: HealthMetric[], key: LongTermMetricKey) {
  return metrics
    .flatMap((metric) => metric[key] == null ? [] : [{ date: metric.date, value: metric[key] }])
    .sort((a, b) => a.date.localeCompare(b.date));
}

function latestValue(metrics: HealthMetric[], key: LongTermMetricKey) {
  return healthSeries(metrics, key).at(-1)?.value ?? null;
}

function miniChange(series: MiniTrendSeries, unit: string, decimals = 0) {
  if (series.change == null || series.points.length < 2) return "Nog onvoldoende metingen";
  const threshold = decimals > 0 ? 0.05 : 0.5;
  if (Math.abs(series.change) < threshold) return "Vrijwel stabiel";
  const value = Math.abs(series.change).toFixed(decimals);
  return `${series.change > 0 ? "+" : "−"}${value} ${unit}`.trim();
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    pulse: <path d="M3 12h4l2.2-6 4 12 2.3-6H21" />,
    run: <><circle cx="15" cy="4" r="2" /><path d="m8 21 3-5 2 2 1 3M6 12l4-4 4 2 3 3 3-1M11 8l-1 8" /></>,
    scale: <><path d="M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /><path d="M9 9a3 3 0 0 1 6 0M12 9l2-2" /></>,
    trend: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

function recencyLabel(signal: RecoverySignal | null) {
  if (!signal) return "Nog geen geldige meting";
  if (signal.ageDays === 0) return "Vandaag gemeten";
  if (signal.ageDays === 1) return "Gisteren gemeten";
  return `Laatste geldige meting ${fmtDate(signal.date)}`;
}

export default async function Home() {
  const historyStart = sql<Date>`CURRENT_TIMESTAMP - INTERVAL '1100 days'`;
  const historyStartDate = sql<string>`CURRENT_DATE - 1100`;
  const [runs, metrics] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, historyStart)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, historyStartDate)),
  ]);

  const hasData = runs.length > 0 || metrics.length > 0;
  const recentRuns = runs.slice(0, 4);
  const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const latestHealth = sortedMetrics.at(-1);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const lastHealthDate = latestHealth?.date;

  const weight = weightSummary(metrics);
  const perf = runPerformanceSummary(runs, metrics);
  const insights = buildInsights(runs, metrics, now);
  const healthAgeDays = lastHealthDate ? dayDifference(today, lastHealthDate) : null;
  const healthIsFresh = healthAgeDays != null && healthAgeDays <= 2;

  const referenceTime = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const recentWeek = runs.filter((run) => run.startDate.getTime() >= referenceTime - 7 * dayMs);
  const previousWeek = runs.filter((run) => run.startDate.getTime() >= referenceTime - 14 * dayMs && run.startDate.getTime() < referenceTime - 7 * dayMs);
  const weeklyKm = recentWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const previousWeeklyKm = previousWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const loadChange = previousWeeklyKm > 0 ? ((weeklyKm - previousWeeklyKm) / previousWeeklyKm) * 100 : null;
  const trainingLoadScore = runs.length > 0
    ? loadChange != null && loadChange > 45 ? 48 : loadChange != null && loadChange > 25 ? 64 : 82
    : null;
  const recovery = buildRecoverySummary(metrics, today, trainingLoadScore);
  const { score: readiness, signals, confidence, freshCount } = recovery;
  const hrv = signals.hrvMs?.value ?? null;
  const restingHeartRate = signals.restingHeartRate?.value ?? null;
  const hrvBaseline = signals.hrvMs?.baseline ?? null;
  const heartRateBaseline = signals.restingHeartRate?.baseline ?? null;
  const metricTrend = (key: "hrvMs" | "restingHeartRate") => recoveryTrend(metrics, key);
  const latestSteps = [...sortedMetrics].reverse().find((metric) => metric.steps != null)?.steps ?? null;
  const latestActiveEnergy = [...sortedMetrics].reverse().find((metric) => metric.activeEnergyKcal != null)?.activeEnergyKcal ?? null;
  const latestVo2 = perf.vo2Trend.at(-1)?.value ?? null;
  const oxygenTrend = healthSeries(metrics, "oxygenSaturationPct");
  const runningPowerTrend = healthSeries(metrics, "runningPowerW");
  const exerciseTrend = healthSeries(metrics, "exerciseMinutes");
  const walkingSteadinessTrend = healthSeries(metrics, "walkingSteadinessPct");
  const stepTrend = sortedMetrics.flatMap((metric) => metric.steps == null ? [] : [{ date: metric.date, value: metric.steps }]);
  const runLoadPoints = runs.map((run) => ({
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(run.startDate),
    value: (run.distanceM ?? 0) / 1000,
  }));
  const hrvMini = buildMiniTrend(metricTrend("hrvMs"), { endDate: today, windowDays: 42, bucketDays: 7 });
  const vo2Mini = buildMiniTrend(perf.vo2Trend, { endDate: today, windowDays: 180 });
  const loadMini = buildMiniTrend(runLoadPoints, { endDate: today, windowDays: 56, bucketDays: 7, aggregation: "sum", includeEmptyBuckets: true });
  const stepsMini = buildMiniTrend(stepTrend, { endDate: today, windowDays: 42, bucketDays: 7 });
  const oxygenMini = buildMiniTrend(oxygenTrend, { endDate: today, windowDays: 30, bucketDays: 3 });
  const runningPowerMini = buildMiniTrend(runningPowerTrend, { endDate: today, windowDays: 90 });
  const exerciseMini = buildMiniTrend(exerciseTrend, { endDate: today, windowDays: 42, bucketDays: 7 });
  const steadinessMini = buildMiniTrend(walkingSteadinessTrend, { endDate: today, windowDays: 180 });
  const latestOxygen = latestValue(metrics, "oxygenSaturationPct");
  const latestRespiratoryRate = latestValue(metrics, "respiratoryRate");
  const latestExerciseMinutes = latestValue(metrics, "exerciseMinutes");
  const latestDaylightMinutes = latestValue(metrics, "daylightMinutes");
  const latestWalkingSpeed = latestValue(metrics, "walkingSpeedKmh");
  const latestWalkingSteadiness = latestValue(metrics, "walkingSteadinessPct");
  const latestSixMinuteWalk = latestValue(metrics, "sixMinuteWalkDistanceM");
  const latestRunningPower = latestValue(metrics, "runningPowerW");
  const latestStrideLength = latestValue(metrics, "runningStrideLengthM");
  const latestVerticalOscillation = latestValue(metrics, "runningVerticalOscillationCm");
  const latestGroundContact = latestValue(metrics, "runningGroundContactTimeMs");
  const hrvChange = hrv != null && hrvBaseline != null && hrvBaseline !== 0
    ? ((hrv - hrvBaseline) / hrvBaseline) * 100
    : null;
  const restingHeartRateChange = restingHeartRate != null && heartRateBaseline != null && heartRateBaseline !== 0
    ? ((restingHeartRate - heartRateBaseline) / heartRateBaseline) * 100
    : null;
  const hrvContext = hrvChange == null
    ? "Je persoonlijke basislijn wordt nog opgebouwd"
    : Math.abs(hrvChange) < 5
      ? "Rond je persoonlijke basislijn"
      : `${Math.abs(hrvChange).toFixed(0)}% ${hrvChange > 0 ? "boven" : "onder"} je basislijn`;
  const hrvInterpretation = hrvChange == null
    ? "Vergelijk HRV pas na meerdere vergelijkbare metingen. Eén losse waarde zegt weinig."
    : hrvChange <= -10 && (restingHeartRateChange ?? 0) >= 3
      ? "HRV staat lager en je rusthartslag hoger dan normaal. Dat ondersteunt vandaag een rustige keuze."
      : hrvChange >= 8 && (restingHeartRateChange ?? 0) <= 1
        ? "HRV staat gunstig ten opzichte van je eigen patroon. Gebruik dat als steun, niet als verplichting om hard te trainen."
        : "Je HRV beweegt binnen je gebruikelijke band. Laat loopgevoel en rusthartslag de doorslag geven.";

  const recommendation = buildTrainingAdvice(runs, readiness, loadChange, now);
  const stateTitle = readiness == null
    ? "Herstel nog niet compleet"
    : readiness >= 78 ? "Sterk hersteld" : readiness >= 58 ? "Stabiele basis" : "Herstel eerst";
  const stateDetail = readiness == null
    ? `${freshCount} van 4 herstelsignalen zijn actueel; voor een persoonlijke score zijn er minimaal 2 met een eigen basislijn nodig.`
    : `${recovery.scoredSignalCount} actuele herstelsignalen en je trainingsbelasting bepalen dit advies.`;

  const loadDetail = loadChange == null
    ? `${recentWeek.length} training${recentWeek.length === 1 ? "" : "en"} deze week`
    : `${Math.abs(loadChange).toFixed(0)}% ${loadChange >= 0 ? "meer" : "minder"} dan vorige week`;

  const coverageDefinitions = [
    { label: "HRV", key: "hrvMs", priority: "Kernsignaal" },
    { label: "Rusthartslag", key: "restingHeartRate", priority: "Kernsignaal" },
    { label: "Cardioherstel", key: "cardioRecovery1m", priority: "Zet aan" },
    { label: "Wandelhartslag", key: "walkingHeartRateAverage", priority: "Zet aan" },
    { label: "VO₂ max", key: "vo2Max", priority: "Conditie" },
    { label: "Stappen", key: "steps", priority: "Context" },
    { label: "Actieve energie", key: "activeEnergyKcal", priority: "Context" },
    { label: "Gewicht", key: "weightKg", priority: "Optioneel" },
    { label: "Zuurstofsaturatie", key: "oxygenSaturationPct", priority: "Welzijn" },
    { label: "Ademfrequentie", key: "respiratoryRate", priority: "Context" },
    { label: "Trainingsminuten", key: "exerciseMinutes", priority: "Belasting" },
    { label: "Daglicht", key: "daylightMinutes", priority: "Herstelcontext" },
    { label: "Wandelsnelheid", key: "walkingSpeedKmh", priority: "Mobiliteit" },
    { label: "Loopvermogen", key: "runningPowerW", priority: "Looptechniek" },
  ] as const;
  const coverage = coverageDefinitions.map((definition) => {
    const values = metrics.flatMap((metric) => {
      const value = metric[definition.key];
      const recoveryKeys: RecoveryMetricKey[] = ["hrvMs", "restingHeartRate", "cardioRecovery1m", "walkingHeartRateAverage"];
      if (recoveryKeys.includes(definition.key as RecoveryMetricKey)) {
        return isUsableRecoveryValue(definition.key as RecoveryMetricKey, value) ? [value!] : [];
      }
      return value == null ? [] : [value];
    });
    const usableCount = definition.key === "steps"
      ? values.filter((value) => value >= 500).length
      : definition.key === "activeEnergyKcal"
        ? values.filter((value) => value >= 50 && value <= 2500).length
        : values.length;
    return { ...definition, count: values.length, usableCount };
  });

  return (
    <div className="dashboard-shell min-h-screen px-4 pb-12 sm:px-7">
      <main className="mx-auto flex max-w-6xl flex-col gap-8">
        <nav className="dashboard-nav" aria-label="Hoofdnavigatie">
          <Link href="/" className="brand-mark" aria-label="Pulse dashboard">
            <AppLogo />
          </Link>
          <div className="nav-links">
            <Link href="/" className="active" aria-current="page">Vandaag</Link>
            <Link href="/runs">Trainingen</Link>
          </div>
          <Link href="/runs" className="profile-chip" aria-label="Bekijk je trainingsprofiel">IK</Link>
        </nav>

        {!hasData ? (
          <section className="empty-hero">
            <span className="eyebrow">Jouw persoonlijke fitnesscoach</span>
            <h1>Van losse data naar<br /><em>slimmere trainingen.</em></h1>
            <p>Pulse combineert herstel, dagelijkse beweging en gezondheid met iedere run. Zo zie je niet alleen wat er gebeurde, maar vooral wat je lichaam vandaag aankan.</p>
            <div className="empty-actions">
              <a className="primary-button" href="/api/strava/auth">Verbind Strava <Icon name="arrow" /></a>
              <span>Apple Opdrachten → <code>/api/health/ingest</code></span>
            </div>
          </section>
        ) : (
          <>
            <header className="today-header">
              <div>
                <p className="eyebrow">Vandaag · {fmtDate(today)}</p>
                <h1>{stateTitle}</h1>
                <p>{recommendation.coach}</p>
              </div>
              <div className="header-actions">
                <span className={`sync-pill ${freshCount < 2 ? "partial" : ""}`}><span className="sync-dot" /> {freshCount} van 4 herstelsignalen actueel</span>
              </div>
            </header>

            <section className="hero-grid" aria-label="Dagvorm en trainingsadvies">
              <article className="today-card">
                <div className="card-topline"><span><Icon name="bolt" /> Dit kun je vandaag doen</span><span>{confidence === "onvoldoende" ? "Voorzichtig advies" : `${confidence} betrouwbaar`}</span></div>
                <div className="workout-badge"><Icon name="run" /></div>
                <div>
                  <h2>{recommendation.label}</h2>
                  <p>{recommendation.detail}</p>
                  <p className="today-reason">{recommendation.coach}</p>
                  <p className="training-rhythm">{recommendation.rhythm}</p>
                </div>
                <a href="#onderbouwing">Waarom dit advies? <Icon name="arrow" /></a>
              </article>

              <article className="readiness-card">
                <div className="card-topline"><span><Icon name="pulse" /> Jouw toestand</span><span className="live-pill">Betrouwbaarheid: {confidence}</span></div>
                <div className="readiness-content">
                  <div className="score-ring" style={{ "--score": `${readiness ?? 0}%` } as CSSProperties}>
                    <div><strong>{readiness ?? "–"}</strong><span>/ 100</span></div>
                  </div>
                  <div className="readiness-copy">
                    <span className={`readiness-label ${readiness != null && readiness >= 78 ? "great" : ""}`}>
                      {stateTitle}
                    </span>
                    <h2>{readiness == null ? "Nog geen betrouwbare dagvorm" : `Dagvorm ${readiness} van 100`}</h2>
                    <p>{stateDetail}</p>
                    <div className="signal-summary">
                      <span>HRV <strong>{hrv != null ? `${Math.round(hrv)} ms` : "–"}</strong><small>{recencyLabel(signals.hrvMs)}</small></span>
                      <span>Rusthartslag <strong>{restingHeartRate != null ? `${Math.round(restingHeartRate)} bpm` : "–"}</strong><small>{recencyLabel(signals.restingHeartRate)}</small></span>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section id="onderbouwing" aria-labelledby="health-overview-title">
              <div className="section-heading health-overview-heading">
                <div><span className="eyebrow">Gezondheid in context</span><h2 id="health-overview-title">Vier trends die samen iets zeggen</h2></div>
                <span className="context-pill">Jouw basislijn, niet een algemene norm</span>
              </div>
              <div className="metric-grid health-overview-grid">
                <HealthOverviewTile
                  title="HRV & herstel"
                  symbol="≈"
                  tone="mint"
                  value={hrv != null ? `${Math.round(hrv)} ms` : "–"}
                  valueLabel="hartslagvariabiliteit"
                  context={signals.hrvMs?.fresh ? hrvContext : recencyLabel(signals.hrvMs)}
                  contextIsGood={hrvChange != null && hrvChange >= 0}
                  supporting={[
                    { label: "Eigen basislijn", value: hrvBaseline != null ? `${Math.round(hrvBaseline)} ms` : "Opbouwend" },
                    { label: "Rusthartslag", value: restingHeartRate != null ? `${Math.round(restingHeartRate)} bpm` : "–" },
                  ]}
                  trend={hrvMini.points}
                  trendColor="var(--series-aqua)"
                  trendPeriod="6 weken · weekgem."
                  trendChange={miniChange(hrvMini, "ms")}
                />
                <HealthOverviewTile
                  title="Hartconditie"
                  symbol="♥"
                  tone="violet"
                  value={latestVo2 != null ? latestVo2.toFixed(1) : "–"}
                  valueLabel="VO₂-max · ml/kg/min"
                  context={perf.vo2Trend.length >= 2 ? "Ontwikkeling van je aerobe capaciteit" : "Nog weinig conditiemetingen"}
                  contextIsGood={perf.vo2Trend.length >= 2 && (latestVo2 ?? 0) >= (perf.vo2Trend[0]?.value ?? 0)}
                  supporting={[
                    { label: "Cardioherstel", value: signals.cardioRecovery1m ? `${Math.round(signals.cardioRecovery1m.value)} bpm` : "–" },
                    { label: "Wandelhartslag", value: signals.walkingHeartRateAverage ? `${Math.round(signals.walkingHeartRateAverage.value)} bpm` : "–" },
                  ]}
                  trend={vo2Mini.points}
                  trendColor="var(--series-violet)"
                  trendPeriod="6 maanden · metingen"
                  trendChange={miniChange(vo2Mini, "", 1)}
                />
                <HealthOverviewTile
                  title="Loopbelasting"
                  symbol="↗"
                  tone="orange"
                  value={`${weeklyKm.toFixed(1)} km`}
                  valueLabel="laatste 7 dagen"
                  context={loadDetail}
                  contextIsGood={loadChange == null || loadChange <= 25}
                  supporting={[
                    { label: "Loopdagen", value: String(recentWeek.length) },
                    { label: "Gem. tempo", value: perf.recentAvgPace != null ? fmtPace(perf.recentAvgPace) : "–" },
                  ]}
                  trend={loadMini.points}
                  trendColor="var(--series-orange)"
                  trendPeriod="8 weken · weekafstand"
                  trendChange={miniChange(loadMini, "km", 1)}
                />
                <HealthOverviewTile
                  title="Beweging & lichaam"
                  symbol="●"
                  tone="blue"
                  value={latestSteps != null ? Math.round(latestSteps).toLocaleString("nl-NL") : "–"}
                  valueLabel="stappen op laatste Health-dag"
                  context={stepsMini.latest != null ? `Recent weekgemiddelde ${Math.round(stepsMini.latest).toLocaleString("nl-NL")} stappen per dag` : "Bewegingstrend wordt opgebouwd"}
                  supporting={[
                    { label: "Actieve energie", value: latestActiveEnergy != null ? `${Math.round(latestActiveEnergy)} kcal` : "–" },
                    { label: "Gewicht", value: weight.current != null ? `${weight.current.toFixed(1)} kg` : "–" },
                  ]}
                  trend={stepsMini.points}
                  trendColor="var(--series-blue)"
                  trendPeriod="6 weken · weekgem."
                  trendChange={miniChange(stepsMini, "stappen")}
                />
              </div>
              <aside className="hrv-explainer" aria-label="Uitleg over HRV">
                <span className="hrv-explainer-symbol" aria-hidden>≈</span>
                <div>
                  <span className="eyebrow">HRV betekent hartslagvariabiliteit</span>
                  <h3>Niet hoe snel je hart klopt, maar hoeveel de tijd tussen hartslagen varieert</h3>
                  <p>Apple drukt dit uit in milliseconden. Een hoger getal is niet automatisch beter: vergelijk vooral met je eigen basislijn, onder vergelijkbare omstandigheden. {hrvInterpretation}</p>
                </div>
                <div className="hrv-reading-guide">
                  <span><i className="guide-up" />Boven basislijn<small>vaak gunstig herstel</small></span>
                  <span><i className="guide-steady" />Rond basislijn<small>normale variatie</small></span>
                  <span><i className="guide-down" />Duidelijk lager<small>combineer met rustpols en gevoel</small></span>
                </div>
              </aside>
            </section>

            <section aria-labelledby="long-term-title">
              <div className="section-heading health-overview-heading">
                <div><span className="eyebrow">Historie uit Apple Health</span><h2 id="long-term-title">Je langetermijnprofiel</h2></div>
                <span className="context-pill">Persoonlijke trends · geen medische diagnose</span>
              </div>
              <div className="metric-grid health-overview-grid">
                <HealthOverviewTile
                  title="Ademhaling & zuurstof"
                  symbol="○"
                  tone="mint"
                  value={latestOxygen != null ? `${latestOxygen.toFixed(1)}%` : "–"}
                  valueLabel="laatste zuurstofsaturatie"
                  context={oxygenTrend.length >= 14 ? `Persoonlijke trend op basis van ${oxygenTrend.length} meetdagen` : "Nog te weinig meetdagen voor een stabiele trend"}
                  supporting={[
                    { label: "Ademfrequentie", value: latestRespiratoryRate != null ? `${latestRespiratoryRate.toFixed(1)}/min` : "–" },
                    { label: "Meetdagen", value: String(oxygenTrend.length) },
                  ]}
                  trend={oxygenMini.points}
                  trendColor="var(--series-aqua)"
                  trendPeriod="30 dagen · 3-daags gem."
                  trendChange={miniChange(oxygenMini, "%", 1)}
                />
                <HealthOverviewTile
                  title="Looptechniek"
                  symbol="↟"
                  tone="orange"
                  value={latestRunningPower != null ? `${Math.round(latestRunningPower)} W` : "–"}
                  valueLabel="gemiddeld vermogen op laatste loopdag"
                  context={runningPowerTrend.length >= 8 ? "Vergelijk dit alleen tussen runs met vergelijkbaar tempo en terrein" : "Loopdynamiek wordt opgebouwd"}
                  supporting={[
                    { label: "Paslengte", value: latestStrideLength != null ? `${latestStrideLength.toFixed(2)} m` : "–" },
                    { label: "Grondcontact", value: latestGroundContact != null ? `${Math.round(latestGroundContact)} ms` : "–" },
                  ]}
                  trend={runningPowerMini.points}
                  trendColor="var(--series-orange)"
                  trendPeriod="3 maanden · loopdagen"
                  trendChange={miniChange(runningPowerMini, "W")}
                />
                <HealthOverviewTile
                  title="Dagelijkse activiteit"
                  symbol="☀"
                  tone="blue"
                  value={latestExerciseMinutes != null ? `${Math.round(latestExerciseMinutes)} min` : "–"}
                  valueLabel="trainingsminuten op laatste meetdag"
                  context="Toont je totale beweegprikkel naast je looptrainingen"
                  supporting={[
                    { label: "Tijd in daglicht", value: latestDaylightMinutes != null ? `${Math.round(latestDaylightMinutes)} min` : "–" },
                    { label: "Wandelsnelheid", value: latestWalkingSpeed != null ? `${latestWalkingSpeed.toFixed(1)} km/u` : "–" },
                  ]}
                  trend={exerciseMini.points}
                  trendColor="var(--series-blue)"
                  trendPeriod="6 weken · weekgem."
                  trendChange={miniChange(exerciseMini, "min")}
                />
                <HealthOverviewTile
                  title="Mobiliteit"
                  symbol="◇"
                  tone="violet"
                  value={latestWalkingSteadiness != null ? `${latestWalkingSteadiness.toFixed(1)}%` : "–"}
                  valueLabel="laatste wandelstabiliteit"
                  context="Ondersteunende trend voor balans en functionele mobiliteit"
                  supporting={[
                    { label: "6-minutenwandeling", value: latestSixMinuteWalk != null ? `${Math.round(latestSixMinuteWalk)} m` : "–" },
                    { label: "Verticale oscillatie", value: latestVerticalOscillation != null ? `${latestVerticalOscillation.toFixed(1)} cm` : "–" },
                  ]}
                  trend={steadinessMini.points}
                  trendColor="var(--series-violet)"
                  trendPeriod="6 maanden · metingen"
                  trendChange={miniChange(steadinessMini, "%", 1)}
                />
              </div>
              <p className="long-term-note">Slaapdata zijn bewust niet in je actuele hersteladvies gebruikt: de export bevat vooral ‘in bed’-registraties en stopt in maart 2025. Bloeddruk is met 16 metingen te schaars voor betrouwbare automatische coaching.</p>
            </section>

            <details className="data-coverage-panel">
              <summary>
                <span><span className="eyebrow">Gegevensstatus</span><strong>Bekijk welke Apple Health-signalen binnenkomen</strong></span>
                <span className={`context-pill ${healthIsFresh ? "" : "stale"}`}>
                  {lastHealthDate ? `Laatste dag ${fmtDate(lastHealthDate)}` : "Nog geen Health-data"}
                </span>
              </summary>
              <div className="coverage-grid">
                {coverage.map((item) => {
                  const ratio = metrics.length ? item.usableCount / metrics.length : 0;
                  const state = item.count === 0 ? "missing" : ratio < 0.5 ? "sparse" : "available";
                  return (
                    <article key={item.key} className={`coverage-item ${state}`}>
                      <span className="coverage-dot" aria-hidden />
                      <div><strong>{item.label}</strong><small>{item.count}/{metrics.length} dagen met waarde{item.usableCount < item.count ? ` · ${item.usableCount} bruikbaar` : ""} · {item.priority}</small></div>
                    </article>
                  );
                })}
              </div>
              <p className="coverage-help">De historische export vult ook signalen aan die niet dagelijks door je opdracht worden verstuurd. Een dag zonder waarde betekent dat Apple Health voor die datum geen geldige meting had; het betekent niet automatisch dat de koppeling ontbreekt. Zuurstof en mobiliteit zijn contextsignalen, geen diagnose.</p>
            </details>

            <section className="content-grid">
              <div className="main-column">
                <TrendChartsSection weightPoints={weight.trend} pacePoints={perf.paceTrend} today={today} />
                <div className="section-heading compact"><div><span className="eyebrow">Coachanalyse</span><h2>Dit valt op in jouw data</h2></div></div>
                <div className="insights-list">{insights.slice(0, 4).map((insight, index) => <InsightCard key={insight.id} insight={insight} index={index + 1} />)}</div>
              </div>

              <aside className="recent-panel">
                <div className="section-heading"><div><span className="eyebrow">Blijf in beweging</span><h2>Recente runs</h2></div><Link href="/runs">Alles</Link></div>
                {recentRuns.length === 0 ? <p className="muted">Nog geen activiteiten gesynchroniseerd.</p> : (
                  <div className="run-list">{recentRuns.map((run, index) => (
                    <Link key={run.id} href={`/runs/${run.id}`} className="run-row">
                      <span className={`run-number color-${index % 4}`}>{String(index + 1).padStart(2, "0")}</span>
                      <span className="run-info"><strong>{run.name || "Run"}</strong><small>{fmtDate(run.startDate)}</small></span>
                      <span className="run-result"><strong>{fmtKm(run.distanceM)}</strong><small>{fmtPace(run.avgPaceMinPerKm)}</small></span>
                      <Icon name="arrow" />
                    </Link>
                  ))}</div>
                )}
                <div className="value-note"><span><Icon name="scale" /></span><div><strong>Kijk naar trends, niet naar één dag</strong><p>HRV, rusthartslag en tempo schommelen normaal. Pas je training aan als meerdere signalen tegelijk dezelfde kant op wijzen.</p></div></div>
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
