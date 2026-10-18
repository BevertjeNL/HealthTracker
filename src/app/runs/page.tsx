import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { SplitsBackfill } from "@/components/SplitsBackfill";
import { SyncButton } from "@/components/SyncButton";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { journalAction } from "@/lib/coach-verdict";
import { fmtDate, fmtDuration, fmtKm, fmtNum, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { buildRunDigest, KIND_LABEL, toAnalysisRun, type RunKind } from "@/lib/run-analysis";
import { buildRunBodyContext, buildTrainingHealth } from "@/lib/training-health";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const FILTERS: { key: "all" | RunKind; label: string }[] = [{ key: "all", label: "Alles" }, { key: "easy", label: "Rustig" }, { key: "long", label: "Lange duur" }, { key: "interval", label: "Interval" }, { key: "race", label: "Wedstrijd" }];

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ type?: string; alle?: string }> }) {
  const query = await searchParams;
  const filter = FILTERS.some((item) => item.key === query.type) ? (query.type as "all" | RunKind) : "all";
  const showAll = query.alle === "1";
  const [rows, health] = await Promise.all([
    db.select().from(activities).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).orderBy(asc(healthMetrics.date)),
  ]);
  const now = new Date();
  const body = buildTrainingHealth(rows, health, now);
  const plan = buildHalfMarathonPlan(rows, now);
  const digest = buildRunDigest(rows.map(toAnalysisRun));
  const digestById = new Map(digest.map((item) => [item.id, item]));
  const loadById = new Map(body.loads.map((item) => [item.id, item]));
  const recent = rows.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * 86_400_000);
  const km28 = recent.reduce((sum, run) => sum + (run.distanceM ?? 0) / 1000, 0);
  const withoutDetails = rows.filter((run) => { const raw = run.raw as Record<string, unknown> | null; return raw?._coach_detail_loaded !== true && !Array.isArray(raw?.splits_metric); }).map((run) => ({ id: run.id, name: run.name || "Hardlooptraining" }));
  const filtered = rows.filter((run) => filter === "all" || digestById.get(run.id)?.kind === filter);
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const href = (type: string, all = false) => `/runs${type !== "all" || all ? "?" : ""}${[type !== "all" ? `type=${type}` : "", all ? "alle=1" : ""].filter(Boolean).join("&")}`;

  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="p-head"><div><span className="p-overline">JE TRAININGSDAGBOEK</span><h1>Runs</h1><p>Per training: wat goed ging, wat opvalt, hoe zwaar het was en hoe je lichaam startte.</p></div><SyncButton /></header>
    {!rows.length ? <section className="c-empty"><h2>Nog geen runs gevonden.</h2><p>Verbind Strava om je trainingen te analyseren.</p><a href="/api/strava/auth" className="c-button">Verbind Strava ↗</a></section> : <>
      <section className="p-tiles p-tiles-4" aria-label="Samenvatting">
        <article className="p-tile"><span className="p-metric-label">Laatste 28 dagen</span><div className="p-metric-value"><strong>{fmtNum(km28, 0)}</strong><small>km · {recent.length} runs</small></div><p className="p-metric-meta"><b>{plan.phase}</b></p></article>
        <Link href="/vorm#belasting" className={`p-tile p-tile-${body.balance.tone}`}><span className="p-metric-label">Belasting</span><div className="p-metric-value"><strong>{body.balance.ratio == null ? "—" : `${fmtNum(body.balance.ratio, 2)}×`}</strong><small>je normale week</small></div><p className="p-metric-meta"><b>{body.balance.label}</b></p></Link>
        <Link href="/vorm#fitness" className={`p-tile p-tile-${body.fitness.verdict.tone}`}><span className="p-metric-label">Fitness</span><div className="p-metric-value"><strong>{body.fitness.efficiency.deltaPct != null ? `${body.fitness.efficiency.deltaPct > 0 ? "+" : ""}${fmtNum(body.fitness.efficiency.deltaPct, 1)}%` : "—"}</strong><small>zuinigheid</small></div><p className="p-metric-meta"><b>{body.fitness.verdict.label}</b></p></Link>
        <Link href="/lichaam" className={`p-tile p-tile-${body.alert.level === "ok" ? "good" : "warning"}`}><span className="p-metric-label">Lichaam</span><div className="p-metric-value"><strong>{body.alert.level === "ok" ? "OK" : body.alert.level === "stop" ? "Rust" : "Let op"}</strong></div><p className="p-metric-meta"><b>{body.alert.title}</b></p></Link>
      </section>
      <SplitsBackfill runs={withoutDetails} />
      <section className="p-section" aria-labelledby="journal-title">
        <div className="p-section-head"><div><span className="p-overline">RUN VOOR RUN</span><h2 id="journal-title">{filtered.length} {filtered.length === 1 ? "run" : "runs"}</h2></div></div>
        <div className="p-chips" role="group" aria-label="Filter op runtype">{FILTERS.map((item) => <Link key={item.key} href={href(item.key)} aria-current={filter === item.key ? "true" : undefined}>{item.label}</Link>)}</div>
        <div className="p-journal">{visible.map((run) => {
          const item = digestById.get(run.id);
          const load = loadById.get(run.id);
          const context = load ? buildRunBodyContext(load, load.day, health, body.loads) : null;
          return <Link href={`/runs/${run.id}`} className="p-jrow" key={run.id}>
            <div className="p-jrow-main">
              <div className="p-jrow-top"><span className="p-jrow-date">{fmtDate(run.startDate)}</span><span className="c-kind">{item ? KIND_LABEL[item.kind] : "Run"}</span>{context && context.readiness.tone !== "unknown" && <span className={`p-badge p-badge-${context.readiness.tone === "good" ? "better" : "worse"}`}>{context.readiness.label}</span>}</div>
              <strong>{run.name || "Hardlooptraining"}</strong>
              <span className={`c-mini-judgment ${item?.tone ?? "info"}`}>{item?.tone === "good" ? "GOED" : item?.tone === "watch" ? "INGRIJPEN" : "LET OP"} · {item?.verdict ?? "Bekijk analyse"}</span>
              <p>{item?.detail ?? "Haal de Strava-details op voor een oordeel."}</p>
              <p className="p-jrow-do"><b>Doe dit:</b> {journalAction(item)}</p>
            </div>
            <div className="p-jrow-metrics"><span><strong>{fmtKm(run.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><small>tempo</small></span><span><strong>{fmtDuration(run.movingTimeS)}</strong><small>tijd</small></span><span><strong>{run.avgHeartRate ? Math.round(run.avgHeartRate) : "—"}</strong><small>hartslag</small></span><span><strong>{load ? load.load : "—"}</strong><small>belasting</small></span></div>
          </Link>;
        })}</div>
        {!showAll && filtered.length > PAGE_SIZE && <p className="p-more"><Link href={href(filter, true)}>Toon alle {filtered.length} runs →</Link></p>}
      </section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
