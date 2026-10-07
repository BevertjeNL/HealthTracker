import Link from "next/link";
import { desc, gte, sql } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { DataRefreshButton } from "@/components/DataRefreshButton";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach } from "@/lib/coach";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { analyzePacing, KIND_LABEL, parseKmSplits, toAnalysisRun } from "@/lib/run-analysis";
import { buildRunStory } from "@/lib/run-story";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [runs, health] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
  ]);
  const now = new Date();
  const coach = buildCoachToday(runs, health, now);
  const plan = buildHalfMarathonPlan(runs, now);
  const last = coach.lastRun;
  const review = last ? buildPostRunCoach(last, runs, health) : null;
  const latestAnalysis = last ? toAnalysisRun(last) : null;
  const latestUnits = latestAnalysis ? parseKmSplits(latestAnalysis.raw) : [];
  const latestStory = latestAnalysis && review ? buildRunStory(latestAnalysis, review.kind, analyzePacing(latestUnits, review.kind), latestUnits) : null;
  const hrv = coach.recovery.signals.hrvMs;
  const rhr = coach.recovery.signals.restingHeartRate;
  const stale = coach.healthAgeDays == null || coach.healthAgeDays > 1;
  const count28 = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * 86_400_000).length;

  return <div className="c-shell"><main className="c-container"><CoachNav active="today" />
    <header className="c-page-head"><div><span className="c-overline">VANDAAG · {fmtDate(coach.today)}</span><h1>Jouw volgende<br /><em>goede stap.</em></h1><p>Een plan uit je runs en je herstel. Elke dag opnieuw berekend.</p></div><DataRefreshButton healthNeedsSync={stale} lastHealthDate={coach.latestHealthDate} /></header>
    {!runs.length ? <section className="c-empty"><span className="c-overline">BEGIN HIER</span><h2>Je coach leert van jouw runs.</h2><p>Verbind Strava om je loopgeschiedenis te laden. Apple Health voegt herstelcontext toe zodra je iPhone de metingen verstuurt.</p><a href="/api/strava/auth" className="c-button">Verbind Strava <span>↗</span></a></section> : <>
      <section className="c-lead-grid" aria-label="Advies en onderbouwing">
        <article className="c-next-card"><div className="c-card-top"><span><i className="c-live-dot" /> ADVIES VOOR VANDAAG</span><small>{coach.recovery.confidence === "onvoldoende" ? "Voorzichtig advies" : `${coach.recovery.confidence} vertrouwen`}</small></div><div className="c-next-content"><span className="c-small-label">DIT PAST NU BIJ JE</span><h2>{coach.advice.label}</h2><p className="c-prescription">{coach.advice.detail}</p><p className="c-coach-explain">{coach.advice.coach}</p></div><div className="c-next-footer"><span>Gebaseerd op jouw ritme, belasting en beschikbare herstelmetingen</span><a href="#waarom">Bekijk waarom ↓</a></div></article>
        <aside className="c-reason-card" id="waarom"><span className="c-overline">WAAROM DIT ADVIES</span><h2>De signalen achter<br />je volgende stap.</h2><ol>{coach.reason.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}</ol><div className="c-source-note"><strong>Apple Health</strong><span>{stale ? `Laatste gegevens: ${coach.latestHealthDate ? fmtDate(coach.latestHealthDate) : "nog niet ontvangen"}. Werk je Health-sync bij voor een actueel herstelbeeld.` : `Bijgewerkt t/m ${fmtDate(coach.latestHealthDate!)}. Dagwaarden worden vergeleken met je eigen basislijn.`}</span></div></aside>
      </section>
      {last && review && <section className="c-last-run" aria-labelledby="last-run-title"><div className="c-section-heading"><div><span className="c-overline">JE LAATSTE RUN</span><h2 id="last-run-title">Wat deze training je vertelt.</h2></div><Link href={`/runs/${last.id}`}>Volledige analyse <span>↗</span></Link></div>{latestAnalysis && latestAnalysis.raw._coach_detail_loaded !== true && !Array.isArray(latestAnalysis.raw.splits_metric) && <RunDetailLoader activityId={last.id} />}<div className="c-last-grid"><div className="c-last-main"><div className="c-last-title"><span className="c-kind">{KIND_LABEL[review.kind]}</span><small>{fmtDate(last.startDate)}</small></div><h3>{last.name || "Hardlooptraining"}</h3><div className="c-run-numbers"><span><strong>{fmtKm(last.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtPace(last.avgPaceMinPerKm)}</strong><small>tempo /km</small></span><span><strong>{fmtDuration(last.movingTimeS)}</strong><small>beweegtijd</small></span></div></div><div className="c-last-verdict"><span className="c-small-label">DE COACH ZIET</span><h3>{latestStory?.hasSplits ? "Zo verliep je run" : review.digest?.verdict ?? "Run vastgelegd"}</h3><p>{latestStory?.hasSplits ? latestStory.summary : review.digest?.detail ?? "Open de run voor je persoonlijke analyse."}</p><div className="c-last-after"><strong>Hierna</strong><span>{review.nextStep}</span></div></div></div></section>}
      <section className="c-lower-grid"><article className="c-direction"><span className="c-overline">WAAR JE STAAT</span><h2>{plan.phase}</h2><p>{plan.phaseReason}</p><div className="c-direction-stats"><span><strong>{count28}</strong><small>runs / 28 dagen</small></span><span><strong>{plan.longestRunKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km</strong><small>langste run / 6 weken</small></span><span><strong>{coach.load.weeklyKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km</strong><small>laatste 7 dagen</small></span></div><div className="c-direction-action"><span><b>Focus voor de komende weken</b><small>{plan.adjustments[0].title}. {plan.adjustments[1].title} als je goed herstelt.</small></span><Link href="/runs">Bekijk je ritme →</Link></div></article><aside className="c-health-card"><span className="c-overline">LICHAAMSCONTEXT</span><h2>Herstel in perspectief.</h2><div className="c-health-line"><span>HRV</span><strong>{hrv?.fresh ? `${Math.round(hrv.value)} ms` : "—"}</strong><small>{hrv?.fresh && hrv.baselineCount >= 5 ? `Basis ${Math.round(hrv.baseline!)} ms` : "Geen actuele basislijn"}</small></div><div className="c-health-line"><span>Rusthartslag</span><strong>{rhr?.fresh ? `${Math.round(rhr.value)} bpm` : "—"}</strong><small>{rhr?.fresh && rhr.baselineCount >= 5 ? `Basis ${Math.round(rhr.baseline!)} bpm` : "Geen actuele basislijn"}</small></div><p>We beoordelen trends ten opzichte van jouw normale waarden. Eén meting is geen oordeel.</p></aside></section>
      <section className="c-recent"><div className="c-section-heading"><div><span className="c-overline">TRAININGSDAGBOEK</span><h2>Terugkijken en bijsturen.</h2></div><Link href="/runs">Alle runs <span>↗</span></Link></div><div className="c-recent-list">{runs.slice(0, 4).map((run) => <Link href={`/runs/${run.id}`} className="c-recent-row" key={run.id}><span className="c-recent-date">{fmtDate(run.startDate)}</span><strong>{run.name || "Run"}</strong><span>{fmtKm(run.distanceM)}</span><span>{fmtPace(run.avgPaceMinPerKm)}</span><b>↗</b></Link>)}</div></section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
