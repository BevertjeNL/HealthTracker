import Link from "next/link";
import { desc } from "drizzle-orm";
import { AppLogo } from "@/components/AppLogo";
import { EventsAnalysis } from "@/components/EventsAnalysis";
import { RaceMarker } from "@/components/RaceMarker";
import { SplitsBackfill } from "@/components/SplitsBackfill";
import { SyncButton } from "@/components/SyncButton";
import { TrainingExplorer, type TrainingRun } from "@/components/TrainingExplorer";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { buildEventAnalysis, buildRunAnalysis, findRaceCandidates, formatPaceSec, formatTime, MIN_SAMPLES, PATTERN_LABEL, toAnalysisRun, type StyleGroup } from "@/lib/run-analysis";

export const dynamic = "force-dynamic";

const TONE_LABEL = { action: "Pak aan", watch: "Let op", good: "Goed bezig", info: "Goed om te weten" } as const;
const sec = (value: number | null, digits = 0) => (value == null ? "–" : `${value > 0 ? "+" : ""}${value.toFixed(digits)} s`);

function StyleCard({ group }: { group: StyleGroup | null }) {
  if (!group) return null;
  return <article className="an-style-card"><span className="eyebrow">{group.label} · {group.runs} runs</span><dl>
    <div><dt>Verloop tweede helft</dt><dd>{sec(group.avgSplitDiffSec)}<small>/km t.o.v. eerste helft</small></dd></div>
    <div><dt>Eerste kilometer</dt><dd>{sec(group.avgStartDeltaSec)}<small>t.o.v. de rest</small></dd></div>
    <div><dt>Spreiding</dt><dd>{group.avgCvPct == null ? "–" : `${group.avgCvPct.toFixed(1)}%`}<small>tussen kilometers</small></dd></div>
    <div><dt>Efficiëntieverlies</dt><dd>{group.avgDecouplingPct == null ? "–" : `${group.avgDecouplingPct.toFixed(1)}%`}<small>tweede helft</small></dd></div>
  </dl></article>;
}

export default async function RunsPage() {
  const rows = await db.select().from(activities).orderBy(desc(activities.startDate));
  const now = new Date();
  const analysisRuns = rows.map(toAnalysisRun);
  const analysis = buildRunAnalysis(analysisRuns, now);
  const candidates = findRaceCandidates(analysisRuns);
  const eventGroups = buildEventAnalysis(analysisRuns).map((group) => ({ key: group.key, label: group.label, advice: group.advice, events: group.events.map((event) => ({ id: event.id, name: event.name, date: event.date.toISOString(), distanceKm: event.distanceKm, timeS: event.timeS, paceSec: event.paceSec, avgHr: event.avgHr, isPr: event.isPr, deltaPrevSec: event.deltaPrevSec, prepWeeklyKm: event.prepWeeklyKm, prepLongestKm: event.prepLongestKm, taperPct: event.taperPct, pattern: event.pattern, fadeSec: event.fadeSec })) }));
  const serialized: TrainingRun[] = rows.map((run) => {
    const raw = run.raw && typeof run.raw === "object" && !Array.isArray(run.raw) ? run.raw as Record<string, unknown> : {};
    return { id: run.id, name: run.name || "Run", date: run.startDate.toISOString(), distanceM: run.distanceM, movingTimeS: run.movingTimeS, pace: run.avgPaceMinPerKm, avgHr: run.avgHeartRate, elevationM: run.elevationGainM, cadence: run.avgCadence, sufferScore: run.sufferScore, workoutType: typeof raw.workout_type === "number" ? raw.workout_type : null, kindOverride: run.kindOverride };
  });
  const { headline, insights, kinds, races, trainingVsRace, predictions, style, coverage } = analysis;
  const trainingKinds = kinds.filter((item) => item.count > 0);

  return <div className="coach-shell min-h-screen px-4 pb-16 sm:px-7"><main className="coach-main training-workspace">
    <nav className="coach-nav" aria-label="Hoofdnavigatie"><Link href="/" className="brand-mark" aria-label="Naar Pulse dashboard"><AppLogo /></Link><div className="coach-nav-links"><Link href="/">Overzicht</Link><Link href="/runs" className="active">Analyse</Link><Link href="/#doel">Doel 21,1 km</Link></div><SyncButton /></nav>

    {!rows.length ? <section className="training-filter-panel"><span className="eyebrow">Nog geen trainingen</span><h2>Verbind Strava om je ontwikkeling te analyseren</h2><a className="primary-button" href="/api/strava/auth">Verbind Strava</a></section> : <>
    <header className={`an-hero ${headline.tone}`}><span className="eyebrow">Loopanalyse · {rows.length} runs</span><h1>{headline.title}</h1><p>{headline.body}</p></header>

    {insights.length > 0 && <section className="an-section" aria-labelledby="an-insights"><div className="training-section-title"><div><span className="eyebrow">Inzichten en advies</span><h2 id="an-insights">Wat de data zegt en wat je ermee doet</h2></div></div><div className="an-insight-grid">{insights.map((item) => <article className={`an-insight ${item.tone}`} key={item.id}><span className="an-tag">{TONE_LABEL[item.tone]} · {item.area}</span><h3>{item.title}</h3><p className="an-evidence">{item.evidence}</p><p className="an-action"><b>Advies</b> {item.advice}</p></article>)}</div></section>}

    <section className="an-section" aria-labelledby="an-race"><div className="training-section-title"><div><span className="eyebrow">Training versus wedstrijd</span><h2 id="an-race">Hoe verschilt je wedstrijd van je training?</h2><p>Strava-trainingen met type Wedstrijd, of met wedstrijd/race in de naam, tellen als wedstrijd.</p></div></div>
      <div className="an-table-wrap"><table className="an-table"><thead><tr><th>Type</th><th>Runs</th><th>Gem. afstand</th><th>Tempo</th><th>Hartslag</th><th>Cadans</th></tr></thead><tbody>{trainingKinds.map((item) => <tr key={item.kind} className={item.kind === "race" ? "an-row-race" : ""}><td><b>{item.label}</b></td><td>{item.count}</td><td>{item.avgDistanceKm.toFixed(1)} km</td><td>{item.count >= MIN_SAMPLES || item.kind === "race" ? `${formatPaceSec(item.paceSec)} /km` : "–"}</td><td>{item.avgHr ? `${Math.round(item.avgHr)} bpm` : "–"}</td><td>{item.cadenceSpm ? `${Math.round(item.cadenceSpm)} spm` : "–"}</td></tr>)}</tbody></table></div>
      {trainingVsRace ? <div className="an-versus"><article><small>Rustig trainingstempo</small><strong>{formatPaceSec(trainingVsRace.easyPaceSec)}</strong><span>/km, laatste 4 maanden</span></article><article><small>Wedstrijdtempo</small><strong>{formatPaceSec(trainingVsRace.racePaceSec)}</strong><span>/km, gemiddeld over {races.length} wedstrijd{races.length === 1 ? "" : "en"}</span></article><article><small>Verschil</small><strong>{Math.round(trainingVsRace.gapSec)} s</strong><span>/km sneller in wedstrijd{trainingVsRace.raceHr && trainingVsRace.trainingHr ? ` · hartslag ${trainingVsRace.raceHr - trainingVsRace.trainingHr >= 0 ? "+" : ""}${Math.round(trainingVsRace.raceHr - trainingVsRace.trainingHr)} bpm` : ""}</span></article></div> : <p className="an-empty">{races.length ? `Voor een vergelijking zijn minimaal ${MIN_SAMPLES} rustige trainingen in de laatste 4 maanden nodig.` : "Nog geen wedstrijden gevonden. Zet in Strava het type van een run op Wedstrijd, dan verschijnt hier de vergelijking."}</p>}
      {candidates.length > 0 && <div className="an-race-list"><h3>Waren dit wedstrijden?</h3><p className="an-hint">Deze runs liggen op een wedstrijdafstand en waren duidelijk sneller en zwaarder dan je andere runs. Jouw keuze bepaalt de vergelijking hierboven.</p>{candidates.map((candidate) => <div className="an-race candidate" key={candidate.id}><div><Link href={`/runs/${candidate.id}`}><strong>{candidate.name}</strong></Link><small>{fmtDate(candidate.date)} · {candidate.band}</small></div><b>{formatTime(candidate.timeS)}</b><span>{formatPaceSec(candidate.paceSec)} /km</span><em>{candidate.reasons.join(" · ")}</em><RaceMarker runId={candidate.id} isRace={false} override={null} variant="suggestion" /></div>)}</div>}
      {races.length > 0 && <div className="an-race-list"><h3>Je wedstrijden</h3>{races.slice(0, 8).map((race) => <Link href={`/runs/${race.id}`} key={race.id} className="an-race"><div><strong>{race.name}</strong><small>{fmtDate(race.date)} · {race.band ?? `${race.distanceKm.toFixed(1)} km`}</small></div><b>{formatTime(race.timeS)}</b><span>{formatPaceSec(race.paceSec)} /km{race.hrPctMax ? ` · ${Math.round(race.hrPctMax)}% max hf` : ""}</span><em>{race.pattern ? `${PATTERN_LABEL[race.pattern]}${race.fadeSec != null ? ` (${race.fadeSec > 0 ? "+" : ""}${race.fadeSec} s)` : ""}` : "Geen splits"}</em></Link>)}</div>}
      {predictions && <div className="an-predict"><h3>Wat kun je lopen?</h3><p>Schatting op basis van {predictions.basis}. {predictions.source === "training" ? "Een trainingsloop onderschat meestal je wedstrijdvorm; zie het als ondergrens." : "Hoe langer de afstand van je wedstrijd afwijkt, hoe onzekerder de schatting."}</p><div className="an-versus">{predictions.items.map((item) => <article key={item.label}><small>{item.label}</small><strong>{formatTime(item.timeS)}</strong><span>{formatPaceSec(item.paceSec)} /km</span></article>)}</div></div>}
    </section>

    {eventGroups.length > 0 && <section className="an-section" aria-labelledby="an-events"><div className="training-section-title"><div><span className="eyebrow">Alle wedstrijden</span><h2 id="an-events">Je wedstrijden per afstand: ontwikkeling en voorbereiding</h2><p>Elke wedstrijd naast je PR, je vorige wedstrijd en de training die eraan voorafging.</p></div></div><EventsAnalysis groups={eventGroups} /></section>}

    <section className="an-section" aria-labelledby="an-style"><div className="training-section-title"><div><span className="eyebrow">Loopstijl per kilometer</span><h2 id="an-style">Hoe verdeel je je krachten?</h2><p>Berekend over runs met kilometergegevens ({coverage.withSplits} van {coverage.total}). Open een run voor de analyse per kilometer of ronde.</p></div></div>
      {style && (style.race || style.training) ? <div className="an-style-grid"><StyleCard group={style.training} /><StyleCard group={style.race} /></div> : <p className="an-empty">Voor een stijlprofiel zijn minimaal {MIN_SAMPLES} runs met kilometergegevens nodig{style ? ` (nu ${style.analyzedRuns})` : ""}. Haal hieronder de splits van je recente runs op.</p>}
      <SplitsBackfill runs={coverage.missingRecent.map((run) => ({ id: run.id, name: run.name }))} />
    </section>

    <section className="an-section" aria-labelledby="an-explore"><div className="training-section-title"><div><span className="eyebrow">Zelf verkennen</span><h2 id="an-explore">Filter, groepeer en vergelijk al je trainingen</h2></div></div></section>
    <TrainingExplorer runs={serialized} referenceNow={now.toISOString()} />
    </>}
  </main></div>;
}
