import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { BodyAlert } from "@/components/BodyAlert";
import { CoachNav } from "@/components/CoachNav";
import { DataRefreshButton } from "@/components/DataRefreshButton";
import { MetricCard } from "@/components/MetricCard";
import { RunBodyCard } from "@/components/RunBodyCard";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { RunTypeChoice } from "@/components/RunTypeChoice";
import { structureSummary } from "@/lib/run-structure";
import { RunLessonCard } from "@/components/RunLessonCard";
import { Spark } from "@/components/Spark";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach, postRunPlanWarning } from "@/lib/coach";
import { buildNextRun } from "@/lib/next-run";
import { fmtDate, fmtDuration, fmtKm, fmtNum, fmtPace, fmtSigned } from "@/lib/format";
import { buildGoalPlan, dateText } from "@/lib/goal-plan";
import { KIND_LABEL, toAnalysisRun } from "@/lib/run-analysis";
import { amsterdamDay, buildRunBodyContext, buildTrainingHealth } from "@/lib/training-health";
import { watchWorkout } from "@/lib/watch-workout";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [runs, health, savedGoals] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
    db.select().from(trainingGoals).where(eq(trainingGoals.id, 1)).limit(1),
  ]);
  const now = new Date();
  const coach = buildCoachToday(runs, health, now);
  const body = buildTrainingHealth(runs, health, now);
  const last = coach.lastRun;
  const review = last ? buildPostRunCoach(last, runs, health) : null;
  const goal = savedGoals[0] ?? null;
  const goalPlan = goal ? buildGoalPlan(goal, runs, { recoveryScore: coach.recovery.score, loadChangePct: coach.load.changePct, sleepConcern: coach.sleep.concern, generalAdvice: coach.advice, lastRunWarning: last && review ? postRunPlanWarning(review, last.startDate) : null }, now) : null;
  const activePlan = goalPlan && goalPlan.daysUntilRace >= 0 ? goalPlan : null;
  const nextRun = buildNextRun({ runs, coach, body: { alertLevel: body.alert.level, alertSignals: body.alert.signals, hrvDeltaPct: body.trends.hrvMs.deltaPct, rhrDeltaPct: body.trends.restingHeartRate.deltaPct }, planDays: activePlan?.weeks.flatMap((week) => week.days) ?? null });
  const watchSteps = watchWorkout(nextRun.detail);
  const stale = coach.healthAgeDays == null || coach.healthAgeDays > 1;

  const lastLoad = last ? body.loads.find((item) => item.id === last.id) : undefined;
  const lastContext = last ? buildRunBodyContext(lastLoad, amsterdamDay(last.startDate), health, body.loads) : null;
  const latestAnalysis = last ? toAnalysisRun(last) : null;
  const weekKm = body.days.slice(-7).reduce((sum, day) => sum + day.km, 0);
  const fit = body.fitness.efficiency;

  return <div className="c-shell"><main className="c-container"><CoachNav active="today" />
    <header className="p-head">
      <div><span className="p-overline">VANDAAG · {fmtDate(coach.today).toUpperCase()}</span><h1>Je volgende run</h1></div>
      <DataRefreshButton healthNeedsSync={stale} lastHealthDate={coach.latestHealthDate} />
    </header>

    {!runs.length ? <section className="c-empty"><span className="c-overline">BEGIN HIER</span><h2>Je coach leert van jouw runs.</h2><p>Verbind Strava om je loopgeschiedenis te laden. Apple Health voegt herstelcontext toe zodra je iPhone de metingen verstuurt.</p><a href="/api/strava/auth" className="c-button">Verbind Strava <span>↗</span></a></section> : <>
      <section className="p-lead" aria-label="Advies voor vandaag">
        <article className={`p-decision p-decision-${nextRun.tone}`}>
          <div className="p-decision-top"><span><i className="p-dot" /> VOLGENDE RUN</span>{(nextRun.source === "schema" || coach.recovery.confidence === "onvoldoende") && <small>{nextRun.source === "schema" ? "Uit je wedstrijdschema" : coach.recovery.confidence === "onvoldoende" ? "Weinig herstelcijfers" : ""}</small>}</div>
          <span className="p-decision-kicker">{nextRun.offset === 0 ? "Vandaag" : `${nextRun.whenLabel} · ${nextRun.inLabel}`}</span>
          <h2>{nextRun.title}</h2>
          <p className="p-decision-do">{nextRun.detail}</p>
          {nextRun.basis.length > 0 && <ul className="p-decision-basis" aria-label="Waarop dit advies steunt">{nextRun.basis.map((item) => <li key={item}>{item}</li>)}</ul>}
          {watchSteps && <div className="p-watch"><b>Stel in op je Apple Watch · Hardlopen → Maak workout aan → Aangepast</b><ol>{watchSteps.map((step) => <li key={step}>{step}</li>)}</ol></div>}
        </article>
      </section>

      {body.alert.level !== "ok" && <BodyAlert alert={body.alert} healthAgeDays={body.healthAgeDays} />}

      <section className="p-section" aria-labelledby="body-heading">
        <div className="p-section-head"><div><span className="p-overline">TRAINING × LICHAAM</span><h2 id="body-heading">Wat je lichaam nu zegt</h2></div><Link href="/vorm">Alle verbanden →</Link></div>
        <div className="p-tiles">
          <Link href="/vorm#belasting" className={`p-tile p-tile-${body.balance.tone}`}>
            <span className="p-metric-label">Belasting</span>
            <div className="p-metric-value"><strong>{body.balance.ratio == null ? "—" : `${fmtNum(body.balance.ratio, 2)}×`}</strong><small>je normale week</small></div>
            <p className="p-metric-meta"><b>{body.balance.label}</b></p>
            <Spark points={body.days.slice(-42).map((day) => ({ date: day.date, value: day.acute }))} color="var(--series-run)" baseline={body.balance.chronic} />
            <p className="p-metric-age">{fmtNum(weekKm, 1)} km in 7 dagen</p>
          </Link>
          <MetricCard trend={body.trends.hrvMs} color="var(--series-hrv)" href="/lichaam" />
          <MetricCard trend={body.trends.restingHeartRate} color="var(--series-rhr)" href="/lichaam" />
          <MetricCard trend={body.trends.sleepHours} color="var(--series-vo2)" href="/lichaam" />
          <Link href="/vorm#fitness" className={`p-tile p-tile-${body.fitness.verdict.tone}`}>
            <span className="p-metric-label">Fitness</span>
            <div className="p-metric-value"><strong>{fit.deltaPct != null ? fmtSigned(fit.deltaPct, 1, "%") : fit.slopePct90 != null ? fmtSigned(fit.slopePct90, 1, "%") : "—"}</strong><small>{fit.deltaPct != null ? "zuiniger vs. vorige 2 mnd" : fit.slopePct90 != null ? "zuiniger per 3 mnd" : "nog onbekend"}</small></div>
            <p className="p-metric-meta"><b>{body.fitness.verdict.label}</b></p>
            <Spark points={fit.series.map((point) => ({ date: point.date, value: point.value }))} color="var(--series-vo2)" baseline={100} />
            {body.trends.vo2Max.current != null && <p className="p-metric-age">VO₂max {fmtNum(body.trends.vo2Max.current, 1)}{body.trends.vo2Max.deltaPct != null ? ` (${fmtSigned(body.trends.vo2Max.deltaPct, 1, "%")})` : ""}</p>}
          </Link>
        </div>
      </section>

      {activePlan && goal && <section className="p-goalbar" aria-label="Wedstrijddoel">
        <div><span className="p-overline">JE WEDSTRIJD</span><h2>{activePlan.distanceLabel} · {dateText(goal.raceDate)}</h2><p>{activePlan.daysUntilRace === 0 ? "Vandaag is het zover" : `Nog ${activePlan.daysUntilRace} dagen`} · doel {activePlan.targetPace}/km · richttijd {activePlan.finishTime} · fase: {activePlan.level}</p></div>
        <Link href="/goal">Bekijk je schema →</Link>
      </section>}
      {!activePlan && <section className="p-goalbar" aria-label="Wedstrijddoel"><div><span className="p-overline">JE WEDSTRIJD</span><h2>Kies je volgende wedstrijd</h2><p>Met een datum en doeltempo maakt je coach een schema vanuit je huidige loopbasis.</p></div><Link href="/goal">Stel je doel in →</Link></section>}

      {last && review && <section className="p-section" aria-labelledby="last-run-title">
        <div className="p-section-head"><div><span className="p-overline">NA JE LAATSTE RUN</span><h2 id="last-run-title">{last.name || "Hardlooptraining"}</h2></div><Link href={`/runs/${last.id}`}>Alle kilometers →</Link></div>
        {latestAnalysis && latestAnalysis.raw._coach_detail_loaded !== true && !Array.isArray(latestAnalysis.raw.splits_metric) && <RunDetailLoader activityId={last.id} />}
        <div className="p-runhead"><span className="c-kind">{KIND_LABEL[review.kind]}</span><span>{fmtDate(last.startDate)}</span><b>{fmtKm(last.distanceM)}</b><b>{fmtPace(last.avgPaceMinPerKm)}</b><b>{fmtDuration(last.movingTimeS)}</b>{last.avgHeartRate != null && <b>{Math.round(last.avgHeartRate)} bpm</b>}</div>
        {review.pacing?.needsConfirmation && review.pacing.structure && <RunTypeChoice runId={last.id} kind={review.kind} sourceLabel="" override={last.kindOverride} ask={{ summary: structureSummary(review.pacing.structure), steadyKind: review.kind === "long" ? "long" : "easy" }} askOnly />}
        <div className="p-two">
          <RunLessonCard lesson={review.lesson} compact />
          {lastContext && <RunBodyCard context={lastContext} loadBasis={lastLoad?.loadBasis} compact />}
        </div>
      </section>}

      <section className="p-section" aria-labelledby="recent-title">
        <div className="p-section-head"><div><span className="p-overline">TRAININGSDAGBOEK</span><h2 id="recent-title">Recente runs</h2></div><Link href="/runs">Alle runs →</Link></div>
        <div className="p-list">{runs.filter((run) => run.id !== last?.id).slice(0, 5).map((run) => { const load = body.loads.find((item) => item.id === run.id); return <Link href={`/runs/${run.id}`} className="p-row" key={run.id}><span className="p-row-date">{fmtDate(run.startDate)}</span><strong>{run.name || "Run"}</strong><span>{fmtKm(run.distanceM)}</span><span>{fmtPace(run.avgPaceMinPerKm)}</span><span className="p-row-load">{load ? `belasting ${load.load}` : ""}</span><b>→</b></Link>; })}</div>
      </section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
