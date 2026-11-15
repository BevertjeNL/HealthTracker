import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { RunLessonCard } from "@/components/RunLessonCard";
import { RaceMarker } from "@/components/RaceMarker";
import { structureSummary } from "@/lib/run-structure";
import { RunTypeChoice } from "@/components/RunTypeChoice";
import { RunCoach } from "@/components/RunCoach";
import { RunDetailLoader } from "@/components/RunDetailLoader";
import { SplitAnalyzer, type RunSplit } from "@/components/SplitAnalyzer";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { buildPostRunCoach } from "@/lib/coach";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { estimateHalfMarathonTime } from "@/lib/half-time";
import { analyzePacing, KIND_LABEL, KIND_SOURCE_LABEL, kindSource, lapsAreDistinct, parseKmSplits, parseLaps, raceStatus, RACE_STATUS_LABEL, runIntent, toAnalysisRun } from "@/lib/run-analysis";
import { buildRunStory } from "@/lib/run-story";
import { RunBodyCard } from "@/components/RunBodyCard";
import { buildRunBodyContext, buildRunLoads } from "@/lib/training-health";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) notFound();
  const [run] = await db.select().from(activities).where(eq(activities.id, parsedId)).limit(1);
  if (!run) notFound();
  const allRuns = await db.select().from(activities);
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(run.startDate);
  const health = await db.select().from(healthMetrics);
  const coach = buildPostRunCoach(run, allRuns, health);
  const loads = buildRunLoads(allRuns, health);
  const runLoad = loads.find((item) => item.id === run.id);
  const bodyContext = buildRunBodyContext(runLoad, localDate, health, loads);
  const analysisRun = toAnalysisRun(run);
  const status = raceStatus(analysisRun);
  const half = estimateHalfMarathonTime(analysisRun);
  const maxHr = allRuns.reduce((max, item) => Math.max(max, item.maxHeartRate ?? 0), 0) || null;
  const kmUnits = parseKmSplits(analysisRun.raw);
  const lapUnits = parseLaps(analysisRun.raw);
  const kmAnalysis = analyzePacing(kmUnits, coach.kind, { maxHrObserved: maxHr, unitName: "kilometer", intent: runIntent(analysisRun), structureUnits: lapsAreDistinct(lapUnits, kmUnits) ? lapUnits : undefined });
  const lapAnalysis = lapsAreDistinct(lapUnits, kmUnits) ? analyzePacing(lapUnits, coach.kind, { maxHrObserved: maxHr, unitName: "ronde", intent: runIntent(analysisRun) }) : null;
  const askInfo = coach.pacing?.needsConfirmation && coach.pacing.structure ? { summary: structureSummary(coach.pacing.structure), steadyKind: coach.kind === "long" ? ("long" as const) : ("easy" as const) } : null;
  const story = buildRunStory(analysisRun, coach.kind, kmAnalysis, kmUnits, lapUnits);
  // Start, midden en slot staan al in de les en in de analyse per kilometer; hier alleen wat daar niet staat.
  const extraPoints = story.points.filter((point) => !["Start", "Midden", "Slot"].includes(point.phase));
  const raw = analysisRun.raw;
  const splits: RunSplit[] = Array.isArray(raw.splits_metric) ? raw.splits_metric.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const split = value as Record<string, unknown>;
    if (typeof split.split !== "number" || typeof split.distance !== "number" || typeof split.moving_time !== "number" || typeof split.average_speed !== "number") return [];
    return [{ split: split.split, distance: split.distance, movingTime: split.moving_time, elevationDifference: typeof split.elevation_difference === "number" ? split.elevation_difference : 0, averageSpeed: split.average_speed, averageHeartRate: typeof split.average_heartrate === "number" ? split.average_heartrate : null }];
  }) : [];
  const stravaId = /^\d+$/.test(run.stravaId) ? run.stravaId : null;

  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="p-head p-head-run"><div><Link href="/runs" className="p-headlink">← Alle runs</Link><div className="p-runhead">{status === "none" ? <span className="c-kind">{KIND_LABEL[coach.kind]}</span> : <span className={status === "confirmed" ? "p-racebadge" : "p-racebadge maybe"}>{RACE_STATUS_LABEL[status]}</span>}<span>{fmtDate(run.startDate)}</span></div><h1>{run.name || "Hardlooptraining"}</h1></div></header>
    <section className="p-tiles p-tiles-4" aria-label="Kerncijfers">
      <article className="p-tile"><span className="p-metric-label">Afstand</span><div className="p-metric-value"><strong>{fmtKm(run.distanceM).replace(" km", "")}</strong><small>km</small></div></article>
      <article className="p-tile"><span className="p-metric-label">Beweegtijd</span><div className="p-metric-value"><strong>{fmtDuration(run.movingTimeS)}</strong></div></article>
      <article className="p-tile"><span className="p-metric-label">Tempo</span><div className="p-metric-value"><strong>{fmtPace(run.avgPaceMinPerKm).replace(" /km", "")}</strong><small>/km</small></div></article>
      <article className="p-tile"><span className="p-metric-label">Gem. hartslag</span><div className="p-metric-value"><strong>{run.avgHeartRate ? Math.round(run.avgHeartRate) : "—"}</strong><small>bpm</small></div>{runLoad && <p className="p-metric-meta">Belasting <b>{runLoad.load}</b></p>}</article>
    </section>
    {half && <section className="p-halfcard" aria-label="Halve marathon op exact 21,0975 km"><div><span className="p-metric-label">Halve marathon, exact 21,0975 km</span><div className="p-metric-value"><strong>{fmtDuration(half.timeS)}</strong><small>{half.method === "splits" ? "uit je kilometertijden" : "geschat"}</small></div></div><p>{half.note} Op beweegtijd, dus een officiële tijd kan afwijken.</p></section>}
    {raw._coach_detail_loaded !== true && !Array.isArray(raw.splits_metric) && <RunDetailLoader activityId={run.id} />}
    <section className="c-detail-lesson">{askInfo && <RunTypeChoice runId={run.id} kind={coach.kind} sourceLabel="" override={run.kindOverride} ask={askInfo} askOnly />}<RunLessonCard lesson={coach.lesson} /></section>
    {(extraPoints.length > 0 || story.available.length > 0) && <section className="c-run-story" aria-label="Wat Strava verder laat zien"><div className="c-section-heading"><div><span className="c-overline">INSPANNING</span><h2>Wat Strava verder laat zien.</h2></div></div>{extraPoints.length > 0 && <div className="c-story-grid">{extraPoints.map((point) => <article className={`c-story-point ${point.tone}`} key={point.phase}><span className={`c-mini-judgment ${point.tone}`}>{point.phase.toUpperCase()}</span><h3>{point.title}</h3><p>{point.detail}</p></article>)}</div>}<p className="c-data-coverage"><strong>Beschikbaar:</strong> {story.available.join(" · ")}.</p></section>}
    <section className="p-section" aria-label="Lichaam rond deze run"><RunBodyCard context={bodyContext} loadBasis={runLoad?.loadBasis} /></section>
    <section className="c-detail-more"><div className="c-section-heading"><div><span className="c-overline">DIEPGANG</span><h2>Per kilometer.</h2></div></div>{status === "probable" && <p className="c-story-empty">Op de naam herkend als wedstrijd.</p>}{status === "probable" && <RaceMarker runId={run.id} isRace override={run.kindOverride} variant="suggestion" />}<RunTypeChoice runId={run.id} kind={coach.kind} sourceLabel={KIND_SOURCE_LABEL[kindSource(analysisRun)]} override={run.kindOverride} />{kmAnalysis || lapAnalysis ? <RunCoach kind={coach.kind} km={kmAnalysis} laps={lapAnalysis} comparison={coach.comparison} /> : <p className="c-story-empty">{raw._coach_detail_loaded === true ? "Er zijn te weinig volledige splits of rondes om een betrouwbaar verloop te tekenen." : "De kilometeranalyse verschijnt zodra Strava de details heeft geleverd."}</p>}<details className="c-deep-dive"><summary>Een deel van je run analyseren <span>+</span></summary><SplitAnalyzer activityId={run.id} splits={splits} detailLoaded={raw._coach_detail_loaded === true || Array.isArray(raw.splits_metric)} /></details>{stravaId && <a className="c-strava-link" href={`https://www.strava.com/activities/${stravaId}`} target="_blank" rel="noopener noreferrer">Bekijk de originele activiteit op Strava ↗</a>}</section>
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
