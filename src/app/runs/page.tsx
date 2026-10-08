import Link from "next/link";
import { desc } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { CoachVerdict } from "@/components/CoachVerdict";
import { SyncButton } from "@/components/SyncButton";
import { SplitsBackfill } from "@/components/SplitsBackfill";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { buildLoadPicture } from "@/lib/coach";
import { journalAction, loadVerdict } from "@/lib/coach-verdict";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";
import { buildHalfMarathonPlan } from "@/lib/half-marathon";
import { buildRunDigest, KIND_LABEL, toAnalysisRun } from "@/lib/run-analysis";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const rows = await db.select().from(activities).orderBy(desc(activities.startDate));
  const now = new Date();
  const load = buildLoadPicture(rows, now);
  const plan = buildHalfMarathonPlan(rows, now);
  const digest = buildRunDigest(rows.map(toAnalysisRun));
  const digestById = new Map(digest.map((item) => [item.id, item]));
  const recent = rows.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * 86_400_000);
  const easyCount = recent.filter((run) => ["easy", "long"].includes(digestById.get(run.id)?.kind ?? "")).length;
  const withoutDetails = rows.filter((run) => { const raw = run.raw as Record<string, unknown> | null; return raw?._coach_detail_loaded !== true && !Array.isArray(raw?.splits_metric); }).map((run) => ({ id: run.id, name: run.name || "Hardlooptraining" }));
  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="c-page-head c-page-head-runs"><div><span className="c-overline">JE TRAININGSDAGBOEK</span><h1>Elke run maakt<br /><em>je plan slimmer.</em></h1><p>Bekijk per training wat goed ging, wat opvalt en wat je hierna kunt doen.</p></div><SyncButton /></header>
    {!rows.length ? <section className="c-empty"><h2>Nog geen runs gevonden.</h2><p>Verbind Strava om je trainingen te analyseren.</p><a href="/api/strava/auth" className="c-button">Verbind Strava ↗</a></section> : <>
      <section className="c-rhythm-grid"><article className="c-rhythm-lead"><span className="c-overline">JE HUIDIGE FASE</span><h2>{plan.phase}</h2><p>{plan.phaseReason}</p><div><strong>{recent.length} runs</strong><span>in de laatste 28 dagen</span></div></article><article className="c-rhythm-side"><span className="c-overline">DE LAATSTE 7 DAGEN</span><strong>{load.weeklyKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} <small>km</small></strong><CoachVerdict verdict={loadVerdict(load.changePct, load.weeklyKm)} compact /></article><article className="c-rhythm-side"><span className="c-overline">DE VERDELING</span><strong>{recent.length ? Math.round(easyCount / recent.length * 100) : 0}<small>%</small></strong><p>van je recente runs waren rustig of lange duur. Dit is een indeling op basis van Strava-type en de naam van je run.</p><p><b>Doe dit:</b> Controleer per run of de indeling klopt en houd je geplande rustige dagen echt rustig.</p></article></section>
      <SplitsBackfill runs={withoutDetails} />
      <section className="c-journal"><div className="c-section-heading"><div><span className="c-overline">RUN VOOR RUN</span><h2>Wat je trainingen vertellen.</h2></div><span>{rows.length} runs</span></div><div className="c-journal-list">{rows.map((run) => { const item = digestById.get(run.id); return <Link href={`/runs/${run.id}`} className="c-journal-row" key={run.id}><div className="c-journal-date">{fmtDate(run.startDate)}</div><div className="c-journal-name"><small>{item ? KIND_LABEL[item.kind] : "Run"}</small><strong>{run.name || "Hardlooptraining"}</strong><span className={`c-mini-judgment ${item?.tone ?? "info"}`}>{item?.tone === "good" ? "GOED" : item?.tone === "watch" ? "INGRIJPEN" : "LET OP"} · {item?.verdict ?? "Bekijk analyse"}</span><span>{item?.detail ?? "Haal de Strava-details op voor een oordeel."}</span><span><b>Doe dit:</b> {journalAction(item)}</span></div><div className="c-journal-metrics"><span><strong>{fmtKm(run.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><small>tempo</small></span><span><strong>{fmtDuration(run.movingTimeS)}</strong><small>tijd</small></span></div><span className="c-journal-arrow">↗</span></Link>; })}</div></section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
