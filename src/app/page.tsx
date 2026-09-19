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

type IconName = "arrow" | "heart" | "run" | "spark" | "target" | "trend";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="m9 18 6-6-6-6" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
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
  const readinessLabel = recovery.score == null ? "Nog onvoldoende data" : recovery.score >= 78 ? "Klaar voor kwaliteit" : recovery.score >= 58 ? "Rustig opbouwen" : "Herstel krijgt voorrang";
  const recoveryTone = recovery.score == null ? "neutral" : recovery.score >= 78 ? "good" : recovery.score >= 58 ? "steady" : "careful";

  if (!runs.length && !metrics.length) {
    return <div className="coach-shell min-h-screen px-4 pb-12 sm:px-7"><main className="coach-main"><nav className="coach-nav" aria-label="Hoofdnavigatie"><Link href="/" className="brand-mark"><AppLogo /></Link></nav><section className="empty-hero"><span className="eyebrow">Jouw persoonlijke hardloopcoach</span><h1>Nog geen data <em>van jou.</em></h1><p>Verbind Strava om je eerste dashboard te zien.</p><div className="empty-actions"><a className="primary-button" href="/api/strava/auth">Verbind Strava <Icon name="arrow" /></a></div></section></main></div>;
  }

  return (
    <div className="coach-shell min-h-screen px-4 pb-16 sm:px-7">
      <main className="coach-main">
        <nav className="coach-nav" aria-label="Hoofdnavigatie">
          <Link href="/" className="brand-mark" aria-label="Pulse overzicht"><AppLogo /></Link>
          <div className="coach-nav-links"><Link href="/" className="active">Overzicht</Link><Link href="/runs">Trainingen</Link></div>
          <Link href="/runs" className="coach-avatar" aria-label="Bekijk trainingen">IK</Link>
        </nav>

        <header className="coach-header">
          <div><p className="eyebrow">Jouw coach · {fmtDate(today)}</p><h1>Dit is wat je lichaam<br /><em>vandaag aankan.</em></h1></div>
          <div className="header-actions"><DataRefreshButton healthNeedsSync={healthNeedsSync} lastHealthDate={lastHealthDate} /><span className={`coach-data-state ${healthNeedsSync ? "stale" : ""}`}><i />{healthNeedsSync ? "Health bijwerken" : "Metingen actueel"}</span></div>
        </header>

        <section className="coach-hero" aria-label="Advies voor vandaag">
          <article className="coach-advice-card">
            <div className="coach-card-kicker"><span><Icon name="spark" /> Advies voor vandaag</span><b>{recovery.confidence} betrouwbaar</b></div>
            <div className="coach-advice-body"><div className="coach-workout-icon"><Icon name="run" /></div><div><span className={`coach-status ${recoveryTone}`}>{readinessLabel}</span><h2>{recommendation.label}</h2><p className="coach-prescription">{recommendation.detail}</p></div></div>
            <div className="coach-advice-footer"><Link href="/runs">Bekijk trainingen <Icon name="arrow" /></Link></div>
          </article>
          <aside className="coach-readiness-card">
            <div className="coach-card-kicker"><span><Icon name="heart" /> Signalen van je lichaam</span><b>{recovery.freshCount}/4 actueel</b></div>
            <div className="readiness-score-row"><div className="coach-score-ring" style={{ "--score": `${recovery.score ?? 0}%` } as CSSProperties}><div><strong>{recovery.score ?? "–"}</strong><span>dagvorm</span></div></div><div><h3>{readinessLabel}</h3></div></div>
            <div className="plain-signals"><span><small>HRV</small><strong>{hrv ? `${Math.round(hrv.value)} ms` : "–"}</strong><em>{hrv?.baseline ? hrv.value >= hrv.baseline ? "op of boven normaal" : "lager dan normaal" : "basislijn opbouwen"}</em></span><span><small>Rusthartslag</small><strong>{restingHeartRate ? `${Math.round(restingHeartRate.value)} bpm` : "–"}</strong><em>{restingHeartRate?.baseline ? restingHeartRate.value <= restingHeartRate.baseline ? "rustig voor jou" : "hoger dan normaal" : "basislijn opbouwen"}</em></span><span><small>Weekbelasting</small><strong>{weeklyKm.toFixed(1)} km</strong><em>{signedPercent(loadChange)}</em></span></div>
          </aside>
        </section>

        <section id="doel" className="goal-panel" aria-labelledby="goal-title">
          <div className="goal-copy"><span className="eyebrow">Jouw doel</span><h2 id="goal-title">21,1 km</h2><p>{plan.summary}</p><div className="goal-progress" aria-label={`${plan.distanceProgressPct}% van halve-marathonafstand bereikt`}><span style={{ width: `${plan.distanceProgressPct}%` }} /></div><div className="goal-progress-labels"><span>Langste recente run: <strong>{plan.longestRunKm.toFixed(1)} km</strong></span><span>Doel: <strong>21,1 km</strong></span></div></div>
          <div className="goal-stage"><Icon name="target" /><span>Huidige fase</span><strong>{plan.phase}</strong></div>
          <div className="goal-numbers"><span><small>Laatste 4 weken</small><strong>{plan.last28DaysKm.toFixed(1)} km</strong></span><span><small>Ritme</small><strong>{plan.runsPerWeek.toFixed(1)}×/week</strong></span><span><small>Actieve weken</small><strong>{plan.activeWeeks}/6</strong></span></div>
        </section>

        <section className="proof-grid">
          <div><div className="coach-section-heading"><div><h2>Jouw trends</h2></div></div><TrendChartsSection weightPoints={weight.trend} pacePoints={performance.paceTrend} today={today} /></div>
          <aside className="latest-runs-card"><div className="coach-section-heading"><div><h2>Laatste trainingen</h2></div><Link href="/runs">Alles</Link></div>{recentRuns.map((run, index) => <Link href={`/runs/${run.id}`} className="coach-run-row" key={run.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{run.name || "Run"}</strong><small>{fmtDate(run.startDate)} · {fmtDuration(run.movingTimeS)}</small></div><div><strong>{fmtKm(run.distanceM)}</strong><small>{fmtPace(run.avgPaceMinPerKm)}</small></div><Icon name="arrow" /></Link>)}{!recentRuns.length && <p className="muted">Nog geen Strava-trainingen gevonden.</p>}{latestVo2 != null && <div className="latest-explainer"><Icon name="trend" /><div><strong>VO₂-max {latestVo2.toFixed(1)}</strong></div></div>}</aside>
        </section>
      </main>
    </div>
  );
}
