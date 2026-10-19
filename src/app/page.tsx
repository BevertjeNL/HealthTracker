import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { BodyAlert } from "@/components/BodyAlert";
import { CoachNav } from "@/components/CoachNav";
import { DataRefreshButton } from "@/components/DataRefreshButton";
import { MetricCard } from "@/components/MetricCard";
import { RunBodyCard } from "@/components/RunBodyCard";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { RunLessonCard } from "@/components/RunLessonCard";
import { Spark } from "@/components/Spark";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach, postRunPlanWarning } from "@/lib/coach";
import { fmtDate, fmtDay, fmtDuration, fmtKm, fmtNum, fmtPace, fmtSigned } from "@/lib/format";
import { buildGoalFeasibility } from "@/lib/goal-feasibility";
import { buildGoalPlan, dateText } from "@/lib/goal-plan";
import { KIND_LABEL, toAnalysisRun } from "@/lib/run-analysis";
import { amsterdamDay, buildRunBodyContext, buildTrainingHealth } from "@/lib/training-health";

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
  const goalPlan = goal ? buildGoalPlan(goal, runs, { recoveryScore: coach.recovery.score, loadChangePct: coach.load.changePct, generalAdvice: coach.advice, lastRunWarning: last && review ? postRunPlanWarning(review, last.startDate) : null }, now) : null;
  const activePlan = goalPlan && goalPlan.daysUntilRace >= 0 ? goalPlan : null;
  const feasibility = activePlan && goal ? buildGoalFeasibility(goal, runs.map(toAnalysisRun), activePlan.daysUntilRace, now) : null;
  const advice = activePlan?.today ?? coach.advice;
  const stale = coach.healthAgeDays == null || coach.healthAgeDays > 1;

  // Health-signalen werken ook met enkele dagen oude data; zo blijft de koppeling zichtbaar na een late sync.
  const reasons: string[] = [...coach.reason];
  if (body.balance.ratio != null) reasons.push(`Belasting ${body.balance.label.toLowerCase()} · ${fmtNum(body.balance.ratio, 2)}× je normale week`);
  for (const signal of body.alert.signals) reasons.push(signal);
  if (!body.alert.signals.length && body.alert.level === "ok" && body.trends.hrvMs.severity === "normal" && body.trends.restingHeartRate.severity === "normal") reasons.push(`HRV en rusthartslag binnen je normale bandbreedte`);
  else if (!body.alert.signals.length && body.trends.restingHeartRate.severity != null && body.trends.restingHeartRate.severity !== "normal" && body.trends.restingHeartRate.direction === "worse") reasons.push(`Rusthartslag ${body.trends.restingHeartRate.deltaPct != null ? fmtSigned(body.trends.restingHeartRate.deltaPct, 1, "%") : ""} t.o.v. je basis: volg of dit doorzet`);
  if (body.fitness.verdict.tone !== "unknown") reasons.push(`Fitness: ${body.fitness.verdict.label.toLowerCase()}`);

  const planAdjusted = activePlan?.weeks[0]?.days[0]?.status === "adjusted";
  const label = advice.label.toLowerCase();
  let tone: "good" | "warning" | "critical" = (coach.recovery.score != null && coach.recovery.score < 58) || (coach.load.changePct != null && coach.load.changePct > 30) ? "critical" : planAdjusted || label.includes("rust") || label.includes("herstel") || label.includes("geen loop") ? "warning" : "good";
  if (body.alert.level === "stop") tone = "critical";
  else if (body.alert.level === "let-op" && tone === "good") tone = "warning";
  if (body.balance.tone === "critical") tone = "critical";

  const lastLoad = last ? body.loads.find((item) => item.id === last.id) : undefined;
  const lastContext = last ? buildRunBodyContext(lastLoad, amsterdamDay(last.startDate), health, body.loads) : null;
  const latestAnalysis = last ? toAnalysisRun(last) : null;
  const weekKm = body.days.slice(-7).reduce((sum, day) => sum + day.km, 0);
  const fit = body.fitness.efficiency;

  return <div className="c-shell"><main className="c-container"><CoachNav active="today" />
    <header className="p-head">
      <div><span className="p-overline">VANDAAG · {fmtDate(coach.today).toUpperCase()}</span><h1>Jouw volgende stap</h1><p>Berekend uit je Strava-runs en je Apple Health-herstel.</p></div>
      <DataRefreshButton healthNeedsSync={stale} lastHealthDate={coach.latestHealthDate} />
    </header>

    {!runs.length ? <section className="c-empty"><span className="c-overline">BEGIN HIER</span><h2>Je coach leert van jouw runs.</h2><p>Verbind Strava om je loopgeschiedenis te laden. Apple Health voegt herstelcontext toe zodra je iPhone de metingen verstuurt.</p><a href="/api/strava/auth" className="c-button">Verbind Strava <span>↗</span></a></section> : <>
      <section className="p-lead" aria-label="Advies voor vandaag">
        <article className={`p-decision p-decision-${tone}`}>
          <div className="p-decision-top"><span><i className="p-dot" /> COACHBESLUIT VANDAAG</span><small>{planAdjusted ? "Schema aangepast aan je ritme" : coach.recovery.confidence === "onvoldoende" ? "Voorzichtig advies" : `${coach.recovery.confidence} vertrouwen`}</small></div>
          <span className="p-decision-kicker">{tone === "critical" ? "Niet forceren" : tone === "warning" ? "Bewust rustig" : "Goed moment"}</span>
          <h2>{advice.label}</h2>
          <p className="p-decision-do">{advice.detail}</p>
          <p className="p-decision-why"><b>Waarom:</b> {advice.coach}</p>
          {activePlan?.nextSession && <p className="p-decision-next"><b>Daarna:</b> {activePlan.nextSession.title} op {dateText(activePlan.nextSession.date)} · {activePlan.nextSession.detail}</p>}
        </article>
        <aside className="p-signals" aria-label="Signalen achter het advies">
          <span className="p-overline">DE SIGNALEN ERACHTER</span>
          <ol>{reasons.map((item) => <li key={item}>{item}</li>)}</ol>
          <p className="p-source"><b>Apple Health</b> {coach.latestHealthDate ? `bijgewerkt t/m ${fmtDay(coach.latestHealthDate, true)}${stale ? " — synchroniseer voor een actueel beeld." : "."}` : "nog niet ontvangen."}</p>
        </aside>
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
        <div><span className="p-overline">JE WEDSTRIJD</span><h2>{activePlan.distanceLabel} · {dateText(goal.raceDate)}</h2><p>{activePlan.daysUntilRace === 0 ? "Vandaag is het zover" : `Nog ${activePlan.daysUntilRace} dagen`} · doel {activePlan.targetPace}/km · richttijd {activePlan.finishTime} · fase: {activePlan.level}</p>{feasibility && <p><b>{feasibility.label}:</b> je basis voorspelt {fmtPace(feasibility.predictedPaceSec / 60)}.</p>}</div>
        <Link href="/goal">Bekijk je schema →</Link>
      </section>}
      {!activePlan && <section className="p-goalbar" aria-label="Wedstrijddoel"><div><span className="p-overline">JE WEDSTRIJD</span><h2>Kies je volgende wedstrijd</h2><p>Met een datum en doeltempo maakt je coach een schema vanuit je huidige loopbasis.</p></div><Link href="/goal">Stel je doel in →</Link></section>}

      {last && review && <section className="p-section" aria-labelledby="last-run-title">
        <div className="p-section-head"><div><span className="p-overline">NA JE LAATSTE RUN</span><h2 id="last-run-title">{last.name || "Hardlooptraining"}</h2></div><Link href={`/runs/${last.id}`}>Alle kilometers →</Link></div>
        {latestAnalysis && latestAnalysis.raw._coach_detail_loaded !== true && !Array.isArray(latestAnalysis.raw.splits_metric) && <RunDetailLoader activityId={last.id} />}
        <div className="p-runhead"><span className="c-kind">{KIND_LABEL[review.kind]}</span><span>{fmtDate(last.startDate)}</span><b>{fmtKm(last.distanceM)}</b><b>{fmtPace(last.avgPaceMinPerKm)}</b><b>{fmtDuration(last.movingTimeS)}</b>{last.avgHeartRate != null && <b>{Math.round(last.avgHeartRate)} bpm</b>}</div>
        <div className="p-two">
          <RunLessonCard lesson={review.lesson} compact />
          {lastContext && <RunBodyCard context={lastContext} loadBasis={lastLoad?.loadBasis} compact />}
        </div>
      </section>}

      <section className="p-section" aria-labelledby="recent-title">
        <div className="p-section-head"><div><span className="p-overline">TRAININGSDAGBOEK</span><h2 id="recent-title">Recente runs</h2></div><Link href="/runs">Alle runs →</Link></div>
        <div className="p-list">{runs.slice(0, 5).map((run) => { const load = body.loads.find((item) => item.id === run.id); return <Link href={`/runs/${run.id}`} className="p-row" key={run.id}><span className="p-row-date">{fmtDate(run.startDate)}</span><strong>{run.name || "Run"}</strong><span>{fmtKm(run.distanceM)}</span><span>{fmtPace(run.avgPaceMinPerKm)}</span><span className="p-row-load">{load ? `belasting ${load.load}` : ""}</span><b>→</b></Link>; })}</div>
      </section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
