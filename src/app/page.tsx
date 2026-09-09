import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { AppLogo } from "@/components/AppLogo";
import { DataRefreshButton } from "@/components/DataRefreshButton";
import { TrendChartsSection } from "@/components/TrendChartsSection";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { buildTrainingAdvice, runPerformanceSummary, weightSummary } from "@/lib/insights";
import { buildRecoverySummary, dayDifference } from "@/lib/recovery";

export const dynamic = "force-dynamic";

type IconName = "arrow" | "heart" | "info" | "moon" | "run" | "spark" | "target" | "trend";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
    run: <><circle cx="15" cy="4" r="2" /><path d="m8 21 3-5 2 2 1 3M6 12l4-4 4 2 3 3 3-1M11 8l-1 8" /></>,
    spark: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    trend: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function signedPercent(value: number | null) {
  if (value == null) return "nog geen vergelijking";
  if (Math.abs(value) < 1) return "vrijwel gelijk aan vorige week";
  return `${Math.abs(value).toFixed(0)}% ${value > 0 ? "meer" : "minder"} dan vorige week`;
}

function paceDifference(current: number | null, baseline: number | null) {
  if (current == null || baseline == null) return "Tempovergelijking wordt opgebouwd";
  const seconds = Math.round(Math.abs(current - baseline) * 60);
  if (seconds < 5) return "Vrijwel gelijk aan je recente tempo";
  return `${seconds} sec/km ${current < baseline ? "sneller" : "rustiger"} dan je recente gemiddelde`;
}

export default async function Home() {
  const historyStart = sql<Date>`CURRENT_TIMESTAMP - INTERVAL '1100 days'`;
  const historyStartDate = sql<string>`CURRENT_DATE - 1100`;
  const [runs, metrics] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, historyStart)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, historyStartDate)),
  ]);

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const latestHealth = sortedMetrics.at(-1);
  const latestRun = runs[0] ?? null;
  const lastHealthDate = latestHealth?.date ?? null;
  const healthAgeDays = lastHealthDate ? dayDifference(today, lastHealthDate) : null;
  const healthNeedsSync = healthAgeDays == null || healthAgeDays > 1;
  const dayMs = 86_400_000;
  const recentWeek = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 7 * dayMs);
  const previousWeek = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 14 * dayMs && run.startDate.getTime() < now.getTime() - 7 * dayMs);
  const weeklyKm = recentWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const previousWeeklyKm = previousWeek.reduce((sum, run) => sum + (run.distanceM ?? 0), 0) / 1000;
  const loadChange = previousWeeklyKm > 0 ? ((weeklyKm - previousWeeklyKm) / previousWeeklyKm) * 100 : null;
  const loadScore = runs.length ? loadChange != null && loadChange > 45 ? 48 : loadChange != null && loadChange > 25 ? 64 : 82 : null;
  const recovery = buildRecoverySummary(metrics, today, loadScore);
  const recommendation = buildTrainingAdvice(runs, recovery.score, loadChange, now);
  const plan = buildHalfMarathonPlan(runs, now);
  const performance = runPerformanceSummary(runs, metrics);
  const weight = weightSummary(metrics);
  const recentRuns = runs.slice(0, 4);
  const hrv = recovery.signals.hrvMs;
  const restingHeartRate = recovery.signals.restingHeartRate;
  const latestVo2 = performance.vo2Trend.at(-1)?.value ?? null;
  const hoursSinceRun = latestRun ? Math.max(0, Math.floor((now.getTime() - latestRun.startDate.getTime()) / 3_600_000)) : null;
  const readinessLabel = recovery.score == null ? "Nog onvoldoende data" : recovery.score >= 78 ? "Klaar voor kwaliteit" : recovery.score >= 58 ? "Rustig opbouwen" : "Herstel krijgt voorrang";
  const recoveryTone = recovery.score == null ? "neutral" : recovery.score >= 78 ? "good" : recovery.score >= 58 ? "steady" : "careful";

  if (!runs.length && !metrics.length) {
    return <div className="coach-shell min-h-screen px-4 pb-12 sm:px-7"><main className="coach-main"><nav className="coach-nav" aria-label="Hoofdnavigatie"><Link href="/" className="brand-mark"><AppLogo /></Link></nav><section className="empty-hero"><span className="eyebrow">Jouw persoonlijke hardloopcoach</span><h1>Van losse metingen naar <em>een slimmer loopplan.</em></h1><p>Verbind Strava en Apple Health. Daarna leggen we in gewone taal uit wat je lichaam aankan en hoe iedere training bijdraagt aan 21,1 kilometer.</p><div className="empty-actions"><a className="primary-button" href="/api/strava/auth">Verbind Strava <Icon name="arrow" /></a></div></section></main></div>;
  }

  return (
    <div className="coach-shell min-h-screen px-4 pb-16 sm:px-7">
      <main className="coach-main">
        <nav className="coach-nav" aria-label="Hoofdnavigatie">
          <Link href="/" className="brand-mark" aria-label="Pulse overzicht"><AppLogo /></Link>
          <div className="coach-nav-links"><Link href="/" className="active">Overzicht</Link><Link href="/runs">Trainingen</Link><a href="#doel">Doel 21,1 km</a></div>
          <Link href="/runs" className="coach-avatar" aria-label="Bekijk trainingen">IK</Link>
        </nav>

        <header className="coach-header">
          <div><p className="eyebrow">Jouw coach · {fmtDate(today)}</p><h1>Dit is wat je lichaam<br /><em>vandaag aankan.</em></h1></div>
          <div className="header-actions"><DataRefreshButton healthNeedsSync={healthNeedsSync} lastHealthDate={lastHealthDate} /><span className={`coach-data-state ${healthNeedsSync ? "stale" : ""}`}><i />{healthNeedsSync ? "Health bijwerken" : "Metingen actueel"}</span></div>
        </header>

        <section className="coach-hero" aria-label="Advies voor vandaag">
          <article className="coach-advice-card">
            <div className="coach-card-kicker"><span><Icon name="spark" /> Advies voor vandaag</span><b>{recovery.confidence} betrouwbaar</b></div>
            <div className="coach-advice-body"><div className="coach-workout-icon"><Icon name="run" /></div><div><span className={`coach-status ${recoveryTone}`}>{readinessLabel}</span><h2>{recommendation.label}</h2><p className="coach-prescription">{recommendation.detail}</p><p className="coach-explanation">{recommendation.coach}</p></div></div>
            <div className="coach-advice-footer"><span><Icon name="info" /> Dit advies combineert herstel, trainingsritme en weekbelasting.</span><a href="#training">Bekijk de uitleg <Icon name="arrow" /></a></div>
          </article>
          <aside className="coach-readiness-card">
            <div className="coach-card-kicker"><span><Icon name="heart" /> Signalen van je lichaam</span><b>{recovery.freshCount}/4 actueel</b></div>
            <div className="readiness-score-row"><div className="coach-score-ring" style={{ "--score": `${recovery.score ?? 0}%` } as CSSProperties}><div><strong>{recovery.score ?? "–"}</strong><span>dagvorm</span></div></div><div><small>In gewone taal</small><h3>{readinessLabel}</h3><p>{recovery.score == null ? "Er zijn minimaal twee actuele signalen met een eigen basislijn nodig." : "De score vergelijkt jouw waarden met jouw eigen normale patroon."}</p></div></div>
            <div className="plain-signals"><span><small>HRV</small><strong>{hrv ? `${Math.round(hrv.value)} ms` : "–"}</strong><em>{hrv?.baseline ? hrv.value >= hrv.baseline ? "op of boven normaal" : "lager dan normaal" : "basislijn opbouwen"}</em></span><span><small>Rusthartslag</small><strong>{restingHeartRate ? `${Math.round(restingHeartRate.value)} bpm` : "–"}</strong><em>{restingHeartRate?.baseline ? restingHeartRate.value <= restingHeartRate.baseline ? "rustig voor jou" : "hoger dan normaal" : "basislijn opbouwen"}</em></span><span><small>Weekbelasting</small><strong>{weeklyKm.toFixed(1)} km</strong><em>{signedPercent(loadChange)}</em></span></div>
          </aside>
        </section>

        <section id="doel" className="goal-panel" aria-labelledby="goal-title">
          <div className="goal-copy"><span className="eyebrow">Jouw doel</span><h2 id="goal-title">Sneller naar de halve marathon</h2><p>{plan.summary}</p><div className="goal-progress" aria-label={`${plan.distanceProgressPct}% van halve-marathonafstand bereikt`}><span style={{ width: `${plan.distanceProgressPct}%` }} /></div><div className="goal-progress-labels"><span>Langste recente run: <strong>{plan.longestRunKm.toFixed(1)} km</strong></span><span>Doel: <strong>21,1 km</strong></span></div></div>
          <div className="goal-stage"><Icon name="target" /><span>Huidige fase</span><strong>{plan.phase}</strong><p>{plan.phaseReason}</p></div>
          <div className="goal-numbers"><span><small>Laatste 4 weken</small><strong>{plan.last28DaysKm.toFixed(1)} km</strong><em>totale loopomvang</em></span><span><small>Gemiddeld ritme</small><strong>{plan.runsPerWeek.toFixed(1)}×</strong><em>lopen per week</em></span><span><small>Actieve weken</small><strong>{plan.activeWeeks}/6</strong><em>weken met een run</em></span></div>
        </section>

        <section id="training" className="training-story" aria-labelledby="story-title">
          <div className="coach-section-heading"><div><span className="eyebrow">Zo lees je jouw data</span><h2 id="story-title">Voor, tijdens en na een training</h2></div><p>De cijfers krijgen pas betekenis als je ze in deze volgorde bekijkt.</p></div>
          <div className="training-timeline">
            <article className="moment-card before"><div className="moment-top"><span>01</span><Icon name="heart" /></div><small>Voor het lopen</small><h3>Kan je lichaam de prikkel aan?</h3><p>We kijken naar HRV, rusthartslag, recente kilometers en hoeveel tijd er sinds je laatste loop zit.</p><div className="moment-reading"><b>Vandaag</b><strong>{readinessLabel}</strong><em>{recommendation.detail}</em></div></article>
            <article className="moment-card during"><div className="moment-top"><span>02</span><Icon name="run" /></div><small>Tijdens het lopen</small><h3>Past de inspanning bij het doel?</h3><p>Tempo zegt hoe snel je loopt; hartslag en praattempo zeggen hoeveel dat je lichaam kost. Rustige runs moeten echt rustig voelen.</p><div className="moment-reading"><b>{latestRun ? "Laatste Strava-run" : "Nog geen Strava-run"}</b><strong>{latestRun ? `${fmtKm(latestRun.distanceM)} · ${fmtPace(latestRun.avgPaceMinPerKm)}` : "Synchroniseer je trainingen"}</strong><em>{latestRun ? paceDifference(latestRun.avgPaceMinPerKm, performance.recentAvgPace) : "Daarna verschijnt hier je trainingsanalyse."}</em></div></article>
            <article className="moment-card after"><div className="moment-top"><span>03</span><Icon name="moon" /></div><small>Na het lopen</small><h3>Heeft je lichaam de training verwerkt?</h3><p>De volgende Health-metingen laten zien of rusthartslag en HRV terugkeren naar je eigen basislijn. Eén afwijkende dag is nog geen probleem.</p><div className="moment-reading"><b>Herstelvenster</b><strong>{hoursSinceRun == null ? "Nog geen run" : hoursSinceRun < 24 ? `${hoursSinceRun} uur na je run` : `${Math.floor(hoursSinceRun / 24)} dagen na je run`}</strong><em>{hoursSinceRun != null && hoursSinceRun < 36 ? "Eten, drinken en slaap leveren nu de winst." : "Kijk naar meerdere signalen vóór je weer intensief traint."}</em></div></article>
          </div>
        </section>

        <section className="adapt-panel" aria-labelledby="adapt-title">
          <div className="adapt-intro"><span className="eyebrow">Wat je nu aanpast</span><h2 id="adapt-title">Drie knoppen om sneller te worden</h2><p>Niet iedere run harder. Een halve marathon wordt sneller door de juiste verdeling van rustige omvang, één gerichte kwaliteitsprikkel en herstel.</p></div>
          <div className="adapt-list">{plan.adjustments.map((item, index) => <article key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{item.label}</small><h3>{item.title}</h3><p>{item.detail}</p></div><b>{item.action}</b></article>)}</div>
        </section>

        <section className="week-panel" aria-labelledby="week-title">
          <div className="coach-section-heading"><div><span className="eyebrow">Voorbeeldweek</span><h2 id="week-title">Een ritme dat je lichaam kan volgen</h2></div><span className="context-pill">Pas aan op je dagvorm</span></div>
          <div className="week-strip">{plan.week.map((day) => <article key={day.day} className={day.tone}><small>{day.day}</small><strong>{day.title}</strong><span>{day.detail}</span></article>)}</div>
          <p className="week-note"><Icon name="info" /> Verhoog niet tegelijk afstand én intensiteit. Blijf bij pijn, ziekte of aanhoudende vermoeidheid rustig en overleg bij twijfel met een professional.</p>
        </section>

        <section className="proof-grid">
          <div><div className="coach-section-heading"><div><span className="eyebrow">Onder de motorkap</span><h2>Trends achter het advies</h2></div><span className="context-pill">Jouw basislijn, geen algemene norm</span></div><TrendChartsSection weightPoints={weight.trend} pacePoints={performance.paceTrend} today={today} /></div>
          <aside className="latest-runs-card"><div className="coach-section-heading"><div><span className="eyebrow">Strava + Health</span><h2>Recente trainingen</h2></div><Link href="/runs">Alles</Link></div>{recentRuns.map((run, index) => <Link href={`/runs/${run.id}`} className="coach-run-row" key={run.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{run.name || "Run"}</strong><small>{fmtDate(run.startDate)} · {fmtDuration(run.movingTimeS)}</small></div><div><strong>{fmtKm(run.distanceM)}</strong><small>{fmtPace(run.avgPaceMinPerKm)}</small></div><Icon name="arrow" /></Link>)}{!recentRuns.length && <p className="muted">Nog geen Strava-trainingen gevonden.</p>}<div className="latest-explainer"><Icon name="trend" /><div><strong>{latestVo2 ? `VO₂-max ${latestVo2.toFixed(1)}` : "Conditietrend wordt opgebouwd"}</strong><p>Gebruik de trend om vooruitgang te volgen; beoordeel nooit één meting of één snelle run los.</p></div></div></aside>
        </section>

        <details className="coach-details"><summary><span><small>Meer weten</small><strong>Hoe komt dit advies tot stand?</strong></span><Icon name="arrow" /></summary><div><p>Pulse combineert Strava-afstand, tempo, hartslag en trainingsritme met recente Apple Health-signalen. De vergelijking gebeurt zoveel mogelijk met jouw eigen basislijn.</p><p>Dit dashboard geeft trainingsondersteuning en geen medische diagnose. Bij klachten, duizeligheid, pijn op de borst of ongewone benauwdheid: stop en vraag medische hulp.</p></div></details>
      </main>
    </div>
  );
}
