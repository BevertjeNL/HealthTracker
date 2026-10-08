import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { RunLessonCard } from "@/components/RunLessonCard";
import { RaceMarker } from "@/components/RaceMarker";
import { RunCoach } from "@/components/RunCoach";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { SplitAnalyzer, type RunSplit } from "@/components/SplitAnalyzer";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { buildPostRunCoach } from "@/lib/coach";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { analyzePacing, KIND_LABEL, lapsAreDistinct, parseKmSplits, parseLaps, toAnalysisRun } from "@/lib/run-analysis";
import { buildRunStory } from "@/lib/run-story";

export const dynamic = "force-dynamic";
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function signal(value: number | null, unit: string) { return value == null ? "—" : `${Math.round(value)} ${unit}`; }
function delta(value: number | null) { return value == null ? "Basislijn ontbreekt" : `${value > 0 ? "+" : ""}${value}% t.o.v. je basislijn`; }

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) notFound();
  const [run] = await db.select().from(activities).where(eq(activities.id, parsedId)).limit(1);
  if (!run) notFound();
  const allRuns = await db.select().from(activities);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(run.startDate);
  const health = await db.select().from(healthMetrics).where(and(gte(healthMetrics.date, shiftDate(localDate, -21)), lte(healthMetrics.date, shiftDate(localDate, 2))));
  const coach = buildPostRunCoach(run, allRuns, health);
  const analysisRun = toAnalysisRun(run);
  const maxHr = allRuns.reduce((max, item) => Math.max(max, item.maxHeartRate ?? 0), 0) || null;
  const kmUnits = parseKmSplits(analysisRun.raw);
  const lapUnits = parseLaps(analysisRun.raw);
  const kmAnalysis = analyzePacing(kmUnits, coach.kind, { maxHrObserved: maxHr, unitName: "kilometer" });
  const lapAnalysis = lapsAreDistinct(lapUnits, kmUnits) ? analyzePacing(lapUnits, coach.kind, { maxHrObserved: maxHr, unitName: "ronde" }) : null;
  const story = buildRunStory(analysisRun, coach.kind, kmAnalysis, kmUnits, lapUnits);
  const raw = analysisRun.raw;
  const splits: RunSplit[] = Array.isArray(raw.splits_metric) ? raw.splits_metric.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const split = value as Record<string, unknown>;
    if (typeof split.split !== "number" || typeof split.distance !== "number" || typeof split.moving_time !== "number" || typeof split.average_speed !== "number") return [];
    return [{ split: split.split, distance: split.distance, movingTime: split.moving_time, elevationDifference: typeof split.elevation_difference === "number" ? split.elevation_difference : 0, averageSpeed: split.average_speed, averageHeartRate: typeof split.average_heartrate === "number" ? split.average_heartrate : null }];
  }) : [];
  const stravaId = /^\d+$/.test(run.stravaId) ? run.stravaId : null;

  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="c-detail-head"><Link href="/runs" className="c-back">← Alle runs</Link><div className="c-detail-meta"><span className="c-kind">{KIND_LABEL[coach.kind]}</span><span>{fmtDate(run.startDate)}</span></div><h1>{run.name || "Hardlooptraining"}</h1><p>De volledige analyse van je inspanning, herstel en volgende stap.</p><div className="c-detail-numbers"><span><strong>{fmtKm(run.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtDuration(run.movingTimeS)}</strong><small>beweegtijd</small></span><span><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><small>tempo /km</small></span><span><strong>{signal(run.avgHeartRate, "bpm")}</strong><small>gem. hartslag</small></span></div></header>
    {raw._coach_detail_loaded !== true && !Array.isArray(raw.splits_metric) && <RunDetailLoader activityId={run.id} />}
    <section className="c-detail-lesson"><RunLessonCard lesson={coach.lesson} /><div className="c-detail-lesson-facts"><strong>Zo verliep je loop</strong><p>{story.summary}</p><p>Bekijk hieronder start, midden en finish kilometer voor kilometer.</p></div></section>
    <section className="c-run-story" aria-label="Verloop van deze run"><div className="c-section-heading"><div><span className="c-overline">VAN START TOT FINISH</span><h2>Wat er tijdens je loop gebeurde.</h2></div></div>{story.points.length ? <div className="c-story-grid">{story.points.map((point) => <article className={`c-story-point ${point.tone}`} key={point.phase}><span className={`c-mini-judgment ${point.tone}`}>{point.tone === "good" ? "GOED" : point.tone === "watch" ? "VERBETEREN" : "CONTEXT"} · {point.phase}</span><h3>{point.title}</h3><p>{point.detail}</p><p className="c-story-action"><b>Doe dit:</b> {point.phase === "Start" ? point.tone === "watch" ? "Begin de volgende vergelijkbare run rustiger en controleer kilometer 1." : "Herhaal deze beheerste opening." : point.phase === "Midden" ? point.tone === "watch" ? "Zoek een gelijkmatig, comfortabel middenstuk op een vergelijkbaar parcours." : "Houd deze inspanning in het middenstuk vast." : point.phase === "Slot" ? point.tone === "watch" ? "Begin rustiger en controleer halverwege of je nog op gesprekstempo loopt." : "Behoud deze verdeling bij je volgende vergelijkbare run." : "Gebruik deze meting als context naast tempo en gevoel; verander je training niet op dit getal alleen."}</p></article>)}</div> : <p className="c-story-empty">Kilometersplits ontbreken. Haal de Strava-details op en open deze run opnieuw voor een oordeel over start, midden en slot.</p>}<p className="c-data-coverage"><strong>Beschikbare metingen:</strong> {story.available.join(" · ")}. Wat Strava voor deze activiteit niet levert, nemen we niet aan.</p></section>
    <section className="c-evidence-grid" aria-label="Onderbouwing van je runanalyse"><article className="c-evidence"><span className="c-overline">01 / TIJDENS JE RUN</span><h2>Waarom dit advies?</h2>{coach.evidence.filter((item) => !item.startsWith("HRV") && !item.startsWith("Rusthartslag")).length ? <ul>{coach.evidence.filter((item) => !item.startsWith("HRV") && !item.startsWith("Rusthartslag")).map((item) => <li key={item}>{item}</li>)}</ul> : <p>{coach.lesson.meaning}</p>}<div className="c-evidence-note">{coach.pacing ? `${coach.pacing.unitCount} kilometers gebruikt voor je tempoverloop.` : "De training is beoordeeld op afstand, tijd en het type loop."}</div></article>
      <article className="c-evidence"><span className="c-overline">02 / APPLE HEALTH</span><h2>Hoe je lichaam reageerde.</h2><h3>{coach.recoveryTitle}</h3><p>{coach.recoveryText}</p><p className="c-health-action"><b>Doe dit:</b> {coach.recoveryTitle === "Herstel staat onder druk" ? "Neem een rustige dag en wacht met intensiteit tot je herstel en gevoel verbeteren." : coach.hrv.deltaPct == null || coach.restingHr.deltaPct == null ? "Maak je volgende loop rustig op praattempo. Plan snelheid pas na een hersteldag." : "Volg de geplande volgende training en controleer je herstel opnieuw voor intensiteit."}</p><div className="c-health-comparison"><span><small>HRV na de run</small><strong>{signal(coach.hrv.after, "ms")}</strong><em>{delta(coach.hrv.deltaPct)}</em></span><span><small>Rusthartslag na de run</small><strong>{signal(coach.restingHr.after, "bpm")}</strong><em>{delta(coach.restingHr.deltaPct)}</em></span></div>{coach.hasHealthOnRunDay && <p className="c-run-day-health">Op de rundag: HRV {signal(coach.hrv.onDay, "ms")} · rusthartslag {signal(coach.restingHr.onDay, "bpm")}. Het meetmoment ten opzichte van de run is onbekend.</p>}<small className="c-timing-note">{coach.healthAfterDate ? `Eerste beschikbare meting op ${fmtDate(coach.healthAfterDate)}.` : "Nog geen meting op de volgende 1–2 dagen."} Een vergelijking gebruikt minstens vijf eerdere metingen per signaal.</small></article></section>
    <section className="c-detail-more"><div className="c-section-heading"><div><span className="c-overline">VERDER KIJKEN</span><h2>Verdiep je in deze run.</h2></div></div><RaceMarker runId={run.id} isRace={coach.kind === "race"} override={run.kindOverride} />{kmAnalysis || lapAnalysis ? <RunCoach kind={coach.kind} km={kmAnalysis} laps={lapAnalysis} comparison={coach.comparison} /> : <p className="c-story-empty">{raw._coach_detail_loaded === true ? "Er zijn te weinig volledige splits of rondes om een betrouwbaar verloop te tekenen." : "De kilometeranalyse verschijnt zodra Strava de details heeft geleverd."}</p>}<details className="c-deep-dive"><summary>Een deel van je run analyseren <span>+</span></summary><SplitAnalyzer activityId={run.id} splits={splits} detailLoaded={raw._coach_detail_loaded === true || Array.isArray(raw.splits_metric)} /></details>{stravaId && <a className="c-strava-link" href={`https://www.strava.com/activities/${stravaId}`} target="_blank" rel="noopener noreferrer">Bekijk de originele activiteit op Strava ↗</a>}</section>
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
