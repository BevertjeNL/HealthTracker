import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { InsightCard } from "@/components/InsightCard";
import { StatTile } from "@/components/StatTile";
import { TrendChart } from "@/components/TrendChart";
import { AppLogo } from "@/components/AppLogo";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDate, fmtKm, fmtPace } from "@/lib/format";
import { buildInsights, runPerformanceSummary, weightSummary } from "@/lib/insights";

export const dynamic = "force-dynamic";

type IconName = "arrow" | "bolt" | "pulse" | "run" | "scale" | "trend";

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

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function dayDifference(later: string, earlier: string) {
  return Math.max(0, Math.floor(
    (new Date(`${later}T12:00:00Z`).getTime() - new Date(`${earlier}T12:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  ));
}

function changeLabel(current: number | null, baseline: number | null, unit: string) {
  if (current == null || baseline == null || baseline === 0) return "Nog geen persoonlijke basislijn";
  const change = ((current - baseline) / baseline) * 100;
  if (Math.abs(change) < 1) return `Gelijk aan je basislijn (${baseline.toFixed(unit === "u" ? 1 : 0)} ${unit})`;
  return `${Math.abs(change).toFixed(0)}% ${change > 0 ? "boven" : "onder"} je basislijn`;
}

export default async function Home() {
  const ninetyDaysAgo = sql<Date>`CURRENT_TIMESTAMP - INTERVAL '90 days'`;
  const ninetyDaysAgoDate = sql<string>`CURRENT_DATE - 90`;
  const [runs, metrics] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, ninetyDaysAgo)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, ninetyDaysAgoDate)),
  ]);

  const hasData = runs.length > 0 || metrics.length > 0;
  const recentRuns = runs.slice(0, 4);
  const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const latestHealth = sortedMetrics.at(-1);
  const now = new Date();
  const baselineMetrics = sortedMetrics.slice(-15, -1);
  const lastHealthDate = latestHealth?.date;
  const metricTrend = (key: "hrvMs" | "restingHeartRate") =>
    sortedMetrics.map((metric) => ({ date: metric.date, value: metric[key] }));

  const weight = weightSummary(metrics);
  const perf = runPerformanceSummary(runs, metrics);
  const insights = buildInsights(runs, metrics, now);
  const hrv = latestHealth?.hrvMs ?? null;
  const restingHeartRate = latestHealth?.restingHeartRate ?? null;
  const cardioRecovery = latestHealth?.cardioRecovery1m ?? null;
  const walkingHeartRate = latestHealth?.walkingHeartRateAverage ?? null;
  const hrvBaseline = average(baselineMetrics.map((metric) => metric.hrvMs));
  const heartRateBaseline = average(baselineMetrics.map((metric) => metric.restingHeartRate));
  const cardioRecoveryBaseline = average(baselineMetrics.map((metric) => metric.cardioRecovery1m));
  const walkingHeartRateBaseline = average(baselineMetrics.map((metric) => metric.walkingHeartRateAverage));

  const today = now.toISOString().slice(0, 10);
  const healthAgeDays = lastHealthDate ? dayDifference(today, lastHealthDate) : null;
  const healthIsFresh = healthAgeDays != null && healthAgeDays <= 2;

  const referenceTime = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const recentWeek = runs.filter((run) => run.startDate.getTime() >= referenceTime - 7 * dayMs);
  const previousWeek = runs.filter((run) => run.startDate.getTime() >= referenceTime - 14 * dayMs && run.startDate.getTime() < referenceTime - 7 * dayMs);
  const weeklyKm = recentWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const previousWeeklyKm = previousWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const loadChange = previousWeeklyKm > 0 ? ((weeklyKm - previousWeeklyKm) / previousWeeklyKm) * 100 : null;

  const readinessParts: number[] = [];
  if (hrv != null) readinessParts.push(hrvBaseline ? clamp(75 + ((hrv - hrvBaseline) / hrvBaseline) * 100, 35, 100) : clamp((hrv / 60) * 90, 35, 100));
  if (restingHeartRate != null && heartRateBaseline != null) readinessParts.push(clamp(75 + ((heartRateBaseline - restingHeartRate) / heartRateBaseline) * 180, 35, 100));
  if (cardioRecovery != null && cardioRecoveryBaseline != null) readinessParts.push(clamp(75 + ((cardioRecovery - cardioRecoveryBaseline) / cardioRecoveryBaseline) * 100, 35, 100));
  if (walkingHeartRate != null && walkingHeartRateBaseline != null) readinessParts.push(clamp(75 + ((walkingHeartRateBaseline - walkingHeartRate) / walkingHeartRateBaseline) * 140, 35, 100));
  if (runs.length > 0) readinessParts.push(loadChange != null && loadChange > 45 ? 48 : loadChange != null && loadChange > 25 ? 64 : 82);
  const rawReadiness = readinessParts.length ? Math.round(average(readinessParts)!) : null;
  const readiness = healthIsFresh && rawReadiness != null
    ? readinessParts.length < 2 ? Math.min(rawReadiness, 70) : rawReadiness
    : null;

  const recommendation = !healthIsFresh
    ? { label: "Rustige duurloop", detail: "25–40 min · comfortabel", coach: "Je Health-data is niet actueel genoeg voor intensief advies. Kies beheerst totdat de synchronisatie weer bij is." }
    : readiness == null
      ? { label: "Vrij bewegen", detail: "20–30 min · comfortabel", coach: "Deel HRV en rusthartslag om je training persoonlijk af te stemmen." }
    : readiness >= 78
      ? { label: "Tempo run", detail: "35–45 min · RPE 7/10", coach: "Je herstel geeft ruimte voor kwaliteit. Houd de snelle blokken beheerst." }
      : readiness >= 58
        ? { label: "Rustige duurloop", detail: "30–45 min · zone 2", coach: "Je basis is stabiel. Bouw conditie op zonder extra herstelvraag." }
        : { label: "Hersteltraining", detail: "20–30 min · zeer rustig", coach: "Vandaag win je meer met herstel dan met intensiteit. Laat het tempo los." };

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
  ] as const;
  const coverage = coverageDefinitions.map((definition) => {
    const values = metrics.flatMap((metric) => {
      const value = metric[definition.key];
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
            <header className="welcome-row">
              <div>
                <p className="eyebrow">Vandaag · jouw coachupdate</p>
                <h1>Klaar voor je volgende <span>stap?</span></h1>
                <p>Herstel, belasting en prestaties komen samen in één helder advies.</p>
              </div>
              <div className="header-actions">
                <span className="sync-pill"><span className="sync-dot" /> Health {lastHealthDate ? `bijgewerkt ${fmtDate(lastHealthDate)}` : "nog niet gekoppeld"}</span>
                <Link href="/runs" className="outline-button">Alle runs <Icon name="arrow" /></Link>
              </div>
            </header>

            <section className="hero-grid" aria-label="Dagvorm en trainingsadvies">
              <article className="readiness-card">
                <div className="card-topline"><span><Icon name="pulse" /> Dagvorm</span><span className="live-pill">Persoonlijk</span></div>
                <div className="readiness-content">
                  <div className="score-ring" style={{ "--score": `${readiness ?? 0}%` } as CSSProperties}>
                    <div><strong>{readiness ?? "–"}</strong><span>/ 100</span></div>
                  </div>
                  <div className="readiness-copy">
                    <span className={`readiness-label ${readiness != null && readiness >= 78 ? "great" : ""}`}>
                      {!healthIsFresh ? "Data niet actueel" : readiness == null ? "Meer data nodig" : readiness >= 78 ? "Sterk hersteld" : readiness >= 58 ? "Stabiele basis" : "Herstel eerst"}
                    </span>
                    <h2>{recommendation.coach}</h2>
                    <p>Gebaseerd op HRV, rusthartslag en trainingsbelasting. Verouderde gegevens leveren bewust geen score op.</p>
                  </div>
                </div>
              </article>

              <article className="today-card">
                <div className="card-topline"><span><Icon name="bolt" /> Advies voor vandaag</span></div>
                <div className="workout-badge"><Icon name="run" /></div>
                <div>
                  <span className="eyebrow">Aanbevolen training</span>
                  <h2>{recommendation.label}</h2>
                  <p>{recommendation.detail}</p>
                </div>
                <Link href="/runs">Bekijk je trainingshistorie <Icon name="arrow" /></Link>
              </article>
            </section>

            <section className="metric-grid" aria-label="Belangrijkste gezondheidswaarden">
              <StatTile label="HRV" value={hrv != null ? `${Math.round(hrv)} ms` : "–"} delta={hrv != null ? changeLabel(hrv, hrvBaseline, "ms") : "Nog geen meting"} deltaIsGood={hrv != null && hrv >= (hrvBaseline ?? hrv)} trend={metricTrend("hrvMs")} trendColor="var(--series-aqua)" icon="pulse" tone="mint" />
              <StatTile label="Rusthartslag" value={restingHeartRate != null ? `${Math.round(restingHeartRate)} bpm` : "–"} delta={restingHeartRate != null ? changeLabel(restingHeartRate, heartRateBaseline, "bpm") : "Nog geen meting"} deltaIsGood={restingHeartRate != null && restingHeartRate <= (heartRateBaseline ?? restingHeartRate)} trend={metricTrend("restingHeartRate")} trendColor="var(--series-violet)" icon="pulse" tone="violet" />
              <StatTile label="Weekbelasting" value={`${weeklyKm.toFixed(1)} km`} delta={loadDetail} deltaIsGood={loadChange == null || loadChange <= 25} icon="run" tone="orange" />
              <StatTile label="VO₂ max" value={perf.vo2Trend.at(-1)?.value?.toFixed(1) ?? "–"} delta="Aerobe conditie" deltaIsGood={perf.vo2Trend.length > 1 && (perf.vo2Trend.at(-1)?.value ?? 0) >= (perf.vo2Trend[0]?.value ?? 0)} trend={perf.vo2Trend} trendColor="var(--series-blue)" icon="trend" tone="blue" />
            </section>

            <section className="correlation-panel">
              <div className="section-heading correlation-heading">
                <div><span className="eyebrow">De verbanden in één oogopslag</span><h2>Wat stuurt je prestatie vandaag?</h2></div>
                <span className="context-pill">Persoonlijke basislijn · 14 dagen</span>
              </div>
              <div className="correlation-flow">
                <article className="signal-card signal-mint"><span className="signal-icon"><Icon name="pulse" /></span><div><small>Herstelbron 1</small><strong>{hrv != null ? `${Math.round(hrv)} ms HRV` : "HRV ontbreekt"}</strong><p>{hrv != null ? changeLabel(hrv, hrvBaseline, "ms") : "Koppel Apple Health"}</p></div></article>
                <span className="flow-plus">+</span>
                <article className="signal-card signal-violet"><span className="signal-icon"><Icon name="pulse" /></span><div><small>Herstelbron 2</small><strong>{restingHeartRate != null ? `${Math.round(restingHeartRate)} bpm` : "Rusthartslag ontbreekt"}</strong><p>{restingHeartRate != null ? changeLabel(restingHeartRate, heartRateBaseline, "bpm") : "Koppel Apple Health"}</p></div></article>
                <span className="flow-plus">+</span>
                <article className="signal-card signal-orange"><span className="signal-icon"><Icon name="run" /></span><div><small>Trainingsprikkel</small><strong>{weeklyKm.toFixed(1)} km</strong><p>{loadDetail}</p></div></article>
                <span className="flow-arrow"><Icon name="arrow" /></span>
                <article className="outcome-card"><small>Coachuitkomst</small><div className="outcome-score">{readiness ?? "–"}<span>/100</span></div><strong>{recommendation.label}</strong></article>
              </div>
              <p className="correlation-note"><Icon name="trend" /> Dit is een coachingsindicatie, geen medische score. Je eigen trend weegt zwaarder dan een algemene norm.</p>
            </section>

            <section className="data-coverage-panel" aria-labelledby="data-coverage-title">
              <div className="section-heading">
                <div><span className="eyebrow">Apple Health-import</span><h2 id="data-coverage-title">Welke signalen komen binnen?</h2></div>
                <span className={`context-pill ${healthIsFresh ? "" : "stale"}`}>
                  {lastHealthDate ? `Laatste dag ${fmtDate(lastHealthDate)}` : "Nog geen Health-data"}
                </span>
              </div>
              <div className="coverage-grid">
                {coverage.map((item) => {
                  const ratio = metrics.length ? item.usableCount / metrics.length : 0;
                  const state = item.count === 0 ? "missing" : ratio < 0.5 ? "sparse" : "available";
                  return (
                    <article key={item.key} className={`coverage-item ${state}`}>
                      <span className="coverage-dot" aria-hidden />
                      <div><strong>{item.label}</strong><small>{item.count}/{metrics.length} ontvangen{item.usableCount < item.count ? ` · ${item.usableCount} bruikbaar` : ""} · {item.priority}</small></div>
                    </article>
                  );
                })}
              </div>
              <p className="coverage-help">Slaap is bewust uitgesloten. Cardioherstel en wandelhartslag zijn de nuttigste ontbrekende imports; stappen en actieve energie dienen alleen als context zolang de dagdekking nog wisselt.</p>
            </section>

            <section className="content-grid">
              <div className="main-column">
                <div className="section-heading"><div><span className="eyebrow">Ontdek het patroon</span><h2>Gezondheid × prestatie</h2></div><span className="context-pill">Laatste 90 dagen</span></div>
                <div className="chart-grid">
                  <TrendChart title="Gewicht" subtitle="7-daags gemiddelde" points={weight.trend} color="var(--series-blue)" unit="kg" />
                  <TrendChart title="Tempo per run" subtitle="Lager is sneller" points={perf.paceTrend} color="var(--series-orange)" unit="pace" reversed />
                </div>
                <div className="section-heading compact"><div><span className="eyebrow">Coachanalyse</span><h2>Dit valt op in jouw data</h2></div></div>
                <div className="insights-list">{insights.map((insight, index) => <InsightCard key={insight.id} insight={insight} index={index + 1} />)}</div>
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
