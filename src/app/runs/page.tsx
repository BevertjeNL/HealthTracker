import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { RaceMarker } from "@/components/RaceMarker";
import { SplitsBackfill } from "@/components/SplitsBackfill";
import { SyncButton } from "@/components/SyncButton";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDate, fmtDuration, fmtKm, fmtNum, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { estimateHalfMarathonTime, HALF_TIME_MAX_M, HALF_TIME_MIN_M } from "@/lib/half-time";
import { buildRunDigest, KIND_LABEL, raceStatus, toAnalysisRun, type RunKind } from "@/lib/run-analysis";
import { buildRunBodyContext, buildTrainingHealth } from "@/lib/training-health";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
type Filter = "all" | RunKind | "probable";
// "Wedstrijd" toont alleen bevestigde wedstrijden (Strava-markering of jouw keuze); runs die alleen op naam lijken op een wedstrijd staan onder "Te bevestigen".
const FILTERS: { key: Filter; label: string }[] = [{ key: "all", label: "Alles" }, { key: "race", label: "Wedstrijd" }, { key: "probable", label: "Te bevestigen" }, { key: "easy", label: "Rustig" }, { key: "long", label: "Lange duur" }, { key: "interval", label: "Interval" }];

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ type?: string; alle?: string }> }) {
  const query = await searchParams;
  const filter = FILTERS.some((item) => item.key === query.type) ? (query.type as Filter) : "all";
  const showAll = query.alle === "1";
  const [rows, health] = await Promise.all([
    db.select().from(activities).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).orderBy(asc(healthMetrics.date)),
  ]);
  const now = new Date();
  const body = buildTrainingHealth(rows, health, now);
  const plan = buildHalfMarathonPlan(rows, now);
  const analysisRuns = rows.map(toAnalysisRun);
  const digest = buildRunDigest(analysisRuns);
  const digestById = new Map(digest.map((item) => [item.id, item]));
  const statusById = new Map(analysisRuns.map((run) => [run.id, raceStatus(run)]));
  const halfById = new Map(analysisRuns.flatMap((run) => { const half = estimateHalfMarathonTime(run); return half ? [[run.id, half] as const] : []; }));
  const loadById = new Map(body.loads.map((item) => [item.id, item]));
  const recent = rows.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * 86_400_000);
  const km28 = recent.reduce((sum, run) => sum + (run.distanceM ?? 0) / 1000, 0);
  const hasDetail = (run: (typeof rows)[number]) => { const raw = run.raw as Record<string, unknown> | null; return raw?._coach_detail_loaded === true || Array.isArray(raw?.splits_metric); };
  // Runs rond de halve marathon eerst: alleen met kilometertijden is de eindtijd op 21,0975 km exact.
  const nearHalf = (run: (typeof rows)[number]) => (run.distanceM ?? 0) >= HALF_TIME_MIN_M && (run.distanceM ?? 0) <= HALF_TIME_MAX_M;
  const withoutDetails = rows.filter((run) => !hasDetail(run)).sort((a, b) => Number(nearHalf(b)) - Number(nearHalf(a))).map((run) => ({ id: run.id, name: run.name || "Hardlooptraining" }));
  const halfWithoutDetails = rows.filter((run) => nearHalf(run) && !hasDetail(run)).length;
  const probableCount = rows.filter((run) => statusById.get(run.id) === "probable").length;
  const matchesFilter = (run: (typeof rows)[number]) => filter === "all" ? true : filter === "race" ? statusById.get(run.id) === "confirmed" : filter === "probable" ? statusById.get(run.id) === "probable" : digestById.get(run.id)?.kind === filter;
  const filtered = rows.filter(matchesFilter);
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const href = (type: string, all = false) => `/runs${type !== "all" || all ? "?" : ""}${[type !== "all" ? `type=${type}` : "", all ? "alle=1" : ""].filter(Boolean).join("&")}`;

  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="p-head"><div><span className="p-overline">JE TRAININGSDAGBOEK</span><h1>Runs</h1><p>Per training de kerncijfers op een regel. Open een run voor wat goed ging, wat opvalt en wat je volgende stap is.</p></div><SyncButton /></header>
    {!rows.length ? <section className="c-empty"><h2>Nog geen runs gevonden.</h2><p>Verbind Strava om je trainingen te analyseren.</p><a href="/api/strava/auth" className="c-button">Verbind Strava ↗</a></section> : <>
      <section className="p-tiles p-tiles-4" aria-label="Samenvatting">
        <article className="p-tile"><span className="p-metric-label">Laatste 28 dagen</span><div className="p-metric-value"><strong>{fmtNum(km28, 0)}</strong><small>km · {recent.length} runs</small></div><p className="p-metric-meta"><b>{plan.phase}</b></p></article>
        <Link href="/vorm#belasting" className={`p-tile p-tile-${body.balance.tone}`}><span className="p-metric-label">Belasting</span><div className="p-metric-value"><strong>{body.balance.ratio == null ? "—" : `${fmtNum(body.balance.ratio, 2)}×`}</strong><small>je normale week</small></div><p className="p-metric-meta"><b>{body.balance.label}</b></p></Link>
        <Link href="/vorm#fitness" className={`p-tile p-tile-${body.fitness.verdict.tone}`}><span className="p-metric-label">Fitness</span><div className="p-metric-value"><strong>{body.fitness.efficiency.deltaPct != null ? `${body.fitness.efficiency.deltaPct > 0 ? "+" : ""}${fmtNum(body.fitness.efficiency.deltaPct, 1)}%` : "—"}</strong><small>zuinigheid</small></div><p className="p-metric-meta"><b>{body.fitness.verdict.label}</b></p></Link>
        <Link href="/lichaam" className={`p-tile p-tile-${body.alert.level === "ok" ? "good" : "warning"}`}><span className="p-metric-label">Lichaam</span><div className="p-metric-value"><strong>{body.alert.level === "ok" ? "OK" : body.alert.level === "stop" ? "Rust" : "Let op"}</strong></div><p className="p-metric-meta"><b>{body.alert.title}</b></p></Link>
      </section>
      <SplitsBackfill runs={withoutDetails} halfCount={halfWithoutDetails} />
      <section className="p-section" aria-labelledby="journal-title">
        <div className="p-section-head"><div><span className="p-overline">RUN VOOR RUN</span><h2 id="journal-title">{filtered.length} {filtered.length === 1 ? "run" : "runs"}</h2></div></div>
        <div className="p-chips" role="group" aria-label="Filter op runtype">{FILTERS.map((item) => <Link key={item.key} href={href(item.key)} aria-current={filter === item.key ? "true" : undefined}>{item.label}{item.key === "probable" && probableCount > 0 && <span className="p-chip-count">{probableCount}</span>}</Link>)}</div>
        <div className="p-journal">{!visible.length && <p className="p-empty">{filter === "probable" ? "Geen runs om te bevestigen." : "Geen runs gevonden voor dit filter."}</p>}{visible.map((run) => {
          const item = digestById.get(run.id);
          const load = loadById.get(run.id);
          const status = statusById.get(run.id) ?? "none";
          const half = halfById.get(run.id);
          const context = load ? buildRunBodyContext(load, load.day, health, body.loads) : null;
          return <div className="p-jwrap" key={run.id}>
            <Link href={`/runs/${run.id}`} className="p-jrow">
              <div className="p-jrow-main">
                <div className="p-jrow-top"><span className="p-jrow-date">{fmtDate(run.startDate)}</span>{status === "confirmed" ? <span className="p-racebadge">Wedstrijd</span> : status === "probable" ? <span className="p-racebadge maybe">Mogelijk wedstrijd</span> : <span className="c-kind">{item ? KIND_LABEL[item.kind] : "Run"}</span>}{context?.readiness.tone === "warning" && <span className="p-badge p-badge-worse">{context.readiness.label}</span>}{item && item.verdict !== KIND_LABEL[item.kind] && <span className={`p-jrow-tag ${item.tone}`}>{item.verdict}</span>}</div>
                <strong>{run.name || "Hardlooptraining"}</strong>
              </div>
              <div className="p-jrow-metrics"><span><strong>{fmtKm(run.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtDuration(run.movingTimeS)}</strong><small>tijd</small></span><span><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><small>tempo</small></span><span><strong>{run.avgHeartRate ? Math.round(run.avgHeartRate) : "—"}</strong><small>hartslag</small></span><span><strong>{load ? load.load : "—"}</strong><small>belasting</small></span>{half ? <span className="p-jrow-half" title={half.note}><strong>{fmtDuration(half.timeS)}</strong><small>halve · {half.method === "splits" ? "uit splits" : "geschat"}</small></span> : <span className="p-jrow-empty" aria-hidden="true"><strong>–</strong><small>halve</small></span>}</div>
            </Link>
            {status === "probable" && <div className="p-jrow-confirm"><span>Was dit een wedstrijd?</span><RaceMarker runId={run.id} isRace override={run.kindOverride} variant="suggestion" /></div>}
          </div>;
        })}</div>
        {!showAll && filtered.length > PAGE_SIZE && <p className="p-more"><Link href={href(filter, true)}>Toon alle {filtered.length} runs →</Link></p>}
      </section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
