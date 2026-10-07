import Link from "next/link";
import { desc } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { SyncButton } from "@/components/SyncButton";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { buildLoadPicture } from "@/lib/coach";
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
  return <div className="c-shell"><main className="c-container"><CoachNav active="runs" />
    <header className="c-page-head c-page-head-runs"><div><span className="c-overline">JE TRAININGSDAGBOEK</span><h1>Elke run maakt<br /><em>je plan slimmer.</em></h1><p>Bekijk per training wat goed ging, wat opvalt en wat je hierna kunt doen.</p></div><SyncButton /></header>
    {!rows.length ? <section className="c-empty"><h2>Nog geen runs gevonden.</h2><p>Verbind Strava om je trainingen te analyseren.</p><a href="/api/strava/auth" className="c-button">Verbind Strava ↗</a></section> : <>
      <section className="c-rhythm-grid"><article className="c-rhythm-lead"><span className="c-overline">JE HUIDIGE FASE</span><h2>{plan.phase}</h2><p>{plan.phaseReason}</p><div><strong>{recent.length} runs</strong><span>in de laatste 28 dagen</span></div></article><article className="c-rhythm-side"><span className="c-overline">DE LAATSTE 7 DAGEN</span><strong>{load.weeklyKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} <small>km</small></strong><p>{load.changePct == null ? "Nog geen betrouwbare weekbasis. Blijf een regelmatig ritme opbouwen." : `${Math.abs(load.changePct)}% ${load.changePct >= 0 ? "boven" : "onder"} je 4-weekse basis. ${load.changePct > 30 ? "Houd de volgende training rustig." : "Bouw op basis van hoe je herstelt."}`}</p></article><article className="c-rhythm-side"><span className="c-overline">DE VERDELING</span><strong>{recent.length ? Math.round(easyCount / recent.length * 100) : 0}<small>%</small></strong><p>van je recente runs waren rustig of lange duur. Dit is een indeling op basis van Strava-type en de naam van je run.</p></article></section>
      <section className="c-journal"><div className="c-section-heading"><div><span className="c-overline">RUN VOOR RUN</span><h2>Wat je trainingen vertellen.</h2></div><span>{rows.length} runs</span></div><div className="c-journal-list">{rows.map((run) => { const item = digestById.get(run.id); return <Link href={`/runs/${run.id}`} className="c-journal-row" key={run.id}><div className="c-journal-date">{fmtDate(run.startDate)}</div><div className="c-journal-name"><small>{item ? KIND_LABEL[item.kind] : "Run"}</small><strong>{run.name || "Hardlooptraining"}</strong><span>{item?.verdict ?? "Bekijk analyse"}</span></div><div className="c-journal-metrics"><span><strong>{fmtKm(run.distanceM)}</strong><small>afstand</small></span><span><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><small>tempo</small></span><span><strong>{fmtDuration(run.movingTimeS)}</strong><small>tijd</small></span></div><span className="c-journal-arrow">↗</span></Link>; })}</div></section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
