import Link from "next/link";
import { asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { DataRefreshButton } from "@/components/DataRefreshButton";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { WeightChartPanel } from "@/components/WeightChartPanel";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach, postRunPlanWarning } from "@/lib/coach";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { buildGoalPlan, dateText } from "@/lib/goal-plan";
import { analyzePacing, KIND_LABEL, parseKmSplits, toAnalysisRun } from "@/lib/run-analysis";
import { buildRunStory } from "@/lib/run-story";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [runs, health, savedGoals, weightRows] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
    db.select().from(trainingGoals).where(eq(trainingGoals.id, 1)).limit(1),
    db.select({ date: healthMetrics.date, weightKg: healthMetrics.weightKg }).from(healthMetrics).where(isNotNull(healthMetrics.weightKg)).orderBy(asc(healthMetrics.date)),
  ]);
  const now = new Date();
  const coach = buildCoachToday(runs, health, now);
  const plan = buildHalfMarathonPlan(runs, now);
  const last = coach.lastRun;
  const review = last ? buildPostRunCoach(last, runs, health) : null;
  const goalPlan = savedGoals[0] ? buildGoalPlan(savedGoals[0], runs, { recoveryScore: coach.recovery.score, loadChangePct: coach.load.changePct, generalAdvice: coach.advice, lastRunWarning: last && review ? postRunPlanWarning(review, last.startDate) : null }, now) : null;
  const activeGoalPlan = goalPlan && goalPlan.daysUntilRace >= 0 ? goalPlan : null;
  const todayAdvice = activeGoalPlan?.today ?? coach.advice;
  const reason = activeGoalPlan ? [`Doel ${activeGoalPlan.distanceLabel.toLowerCase()} op ${dateText(savedGoals[0].raceDate)} · ${activeGoalPlan.targetPace}/km`, ...coach.reason] : coach.reason;
  const latestAnalysis = last ? toAnalysisRun(last) : null;
  const latestUnits = latestAnalysis ? parseKmSplits(latestAnalysis.raw) : [];
  const latestStory = latestAnalysis && review ? buildRunStory(latestAnalysis, review.kind, analyzePacing(latestUnits, review.kind), latestUnits) : null;
  const hrv = coach.recovery.signals.hrvMs;
  const rhr = coach.recovery.signals.restingHeartRate;
  const stale = coach.healthAgeDays == null || coach.healthAgeDays > 1;
  const count28 = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * 86_400_000).length;
  const weightPoints = weightRows.map((row) => ({ date: row.date, value: row.weightKg }));
  const planAdjustedToday = activeGoalPlan?.weeks[0]?.days[0]?.status === "adjusted";

  return <div className="c-shell"><main className="c-container"><CoachNav active="today" />
    <header className="c-page-head"><div><span className="c-overline">VANDAAG · {fmtDate(coach.today)}</span><h1>Jouw volgende<br /><em>goede stap.</em></h1><p>Een plan uit je runs en je herstel. Elke dag opnieuw berekend.</p></div><DataRefreshButton healthNeedsSync={stale} lastHealthDate={coach.latestHealthDate} /></header>
    <section className="g-home-target"><div><span className="c-overline">JOUW WEDSTRIJDDOEL</span><h2>{activeGoalPlan ? activeGoalPlan.distanceLabel : "Kies je volgende wedstrijd"}</h2><p>{activeGoalPlan ? `${dateText(savedGoals[0].raceDate)} · ${activeGoalPlan.daysUntilRace} dagen · ${activeGoalPlan.targetPace}/km · richttijd ${activeGoalPlan.finishTime}` : "Stel een datum en doeltempo in; je coach maakt dan een schema vanuit je huidige loopbasis."}</p></div><Link href="/goal">{activeGoalPlan ? "Bekijk je schema →" : "Stel je doel in →"}</Link></section>
    {!runs.length ? <><section className="c-empty"><span className="c-overline">BEGIN HIER</span><h2>Je coach leert van jouw runs.</h2><p>Verbind Strava om je loopgeschiedenis te laden. Apple Health voegt herstelcontext toe zodra je iPhone de metingen verstuurt.</p><a href="/api/strava/auth" className="c-button">Verbind Strava <span>↗</span></a></section><WeightChartPanel points={weightPoints} today={coach.today} /></> : <>
      <section className="c-lead-grid" aria-label="Advies en onderbouwing">
        <article className="c-next-card"><div className="c-card-top"><span><i className="c-live-dot" /> JOUW COACHBESLUIT VOOR VANDAAG</span><small>{planAdjustedToday ? "Schema aangepast aan herstel" : coach.recovery.confidence === "onvoldoende" ? "Voorzichtig advies" : `${coach.recovery.confidence} vertrouwen`}</small></div><div className="c-next-content"><span className="c-small-label">DIT DOE JE NU</span><h2>{todayAdvice.label}</h2><p className="c-prescription">{todayAdvice.detail}</p><p className="c-coach-explain">{todayAdvice.coach}</p>{activeGoalPlan?.nextSession && <p className="c-next-session"><strong>Daarna:</strong> {activeGoalPlan.nextSession.title} op {dateText(activeGoalPlan.nextSession.date)} · {activeGoalPlan.nextSession.detail}</p>}</div><div className="c-next-footer"><span>Gebaseerd op jouw ritme, belasting en beschikbare herstelmetingen</span><a href="#waarom">Bekijk waarom ↓</a></div></article>
        <aside className="c-reason-card" id="waarom"><span className="c-overline">WAAROM DIT ADVIES</span><h2>De signalen achter<br />je volgende stap.</h2><ol>{reason.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}</ol><div className="c-source-note"><strong>Apple Health</strong><span>{stale ? `Laatste gegevens: ${coach.latestHealthDate ? fmtDate(coach.latestHealthDate) : "nog niet ontvangen"}. Werk je Health-sync bij voor een actueel herstelbeeld.` : `Bijgewerkt t/m ${fmtDate(coach.latestHealthDate!)}. Dagwaarden worden vergeleken met je eigen basislijn.`}</span></div></aside>
      </section>
      {last && review && <section className="c-last-run" aria-labelledby="last-run-title"><div className="c-section-heading"><div><span className="c-overline">NA JE LAATSTE RUN</span><h2 id="last-run-title">Wat gebeurde er en wat leer je ervan?</h2></div><Link href={`/runs/${last.id}`}>Analyse per kilometer <span>↗</span></Link></div>{latestAnalysis && latestAnalysis.raw._coach_detail_loaded !== true && !Array.isArray(latestAnalysis.raw.splits_metric) && <RunDetailLoader activityId={last.id} />}<div className="c-last-grid"><div className="c-last-main"><div className="c-last-title"><span className="c-kind">{KIND_LABEL[review.kind]}</span><small>{fmtDate(last.startDate)}</small></div><h3>{last.name || "Hardlooptraining"}</h3><div className="c-run-numbers"><span><strong>{fmtKm(last.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtPace(last.avgPaceMinPerKm)}</strong><small>tempo /km</small></span><span><strong>{fmtDuration(last.movingTimeS)}</strong><small>beweegtijd</small></span></div></div><div className="c-last-verdict"><span className="c-small-label">ANALYSE VAN JE LOOP</span><h3>{latestStory?.hasSplits ? "Zo verliep je run" : review.digest?.verdict ?? "Run vastgelegd"}</h3><p>{latestStory?.hasSplits ? latestStory.summary : review.digest?.detail ?? "Open de run voor je persoonlijke analyse."}</p>{review.evidence.length > 0 && <ul className="c-last-evidence">{review.evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>}<div className="c-last-after"><strong>Les voor je volgende loop</strong><span>{review.nextStep}</span></div></div></div></section>}
      <WeightChartPanel points={weightPoints} today={coach.today} />
      <section className="c-lower-grid"><article className="c-direction"><span className="c-overline">WAAR JE STAAT</span><h2>{activeGoalPlan?.level ?? plan.phase}</h2><p>{activeGoalPlan?.assessment ?? plan.phaseReason}</p><div className="c-direction-stats"><span><strong>{count28}</strong><small>runs / 28 dagen</small></span><span><strong>{plan.longestRunKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km</strong><small>langste run / 6 weken</small></span><span><strong>{coach.load.weeklyKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km</strong><small>laatste 7 dagen</small></span></div><div className="c-direction-action"><span><b>Focus voor de komende weken</b><small>{activeGoalPlan?.nextSession ? `${activeGoalPlan.nextSession.title} op ${dateText(activeGoalPlan.nextSession.date)}. ${activeGoalPlan.nextSession.detail}` : `${plan.adjustments[0].title}. ${plan.adjustments[1].title} als je goed herstelt.`}</small></span><Link href={activeGoalPlan ? "/goal" : "/runs"}>{activeGoalPlan ? "Volledig schema →" : "Bekijk je ritme →"}</Link></div></article><aside className="c-health-card"><span className="c-overline">LICHAAMSCONTEXT</span><h2>Herstel in perspectief.</h2><div className="c-health-line"><span>HRV</span><strong>{hrv?.fresh ? `${Math.round(hrv.value)} ms` : "—"}</strong><small>{hrv?.fresh && hrv.baselineCount >= 5 ? `Basis ${Math.round(hrv.baseline!)} ms` : "Geen actuele basislijn"}</small></div><div className="c-health-line"><span>Rusthartslag</span><strong>{rhr?.fresh ? `${Math.round(rhr.value)} bpm` : "—"}</strong><small>{rhr?.fresh && rhr.baselineCount >= 5 ? `Basis ${Math.round(rhr.baseline!)} bpm` : "Geen actuele basislijn"}</small></div><p>We beoordelen trends ten opzichte van jouw normale waarden. Eén meting is geen oordeel.</p></aside></section>
      <section className="c-recent"><div className="c-section-heading"><div><span className="c-overline">TRAININGSDAGBOEK</span><h2>Terugkijken en bijsturen.</h2></div><Link href="/runs">Alle runs <span>↗</span></Link></div><div className="c-recent-list">{runs.slice(0, 4).map((run) => <Link href={`/runs/${run.id}`} className="c-recent-row" key={run.id}><span className="c-recent-date">{fmtDate(run.startDate)}</span><strong>{run.name || "Run"}</strong><span>{fmtKm(run.distanceM)}</span><span>{fmtPace(run.avgPaceMinPerKm)}</span><b>↗</b></Link>)}</div></section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
