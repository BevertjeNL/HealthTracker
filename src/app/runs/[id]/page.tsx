import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { AppLogo } from "@/components/AppLogo";
import { SplitAnalyzer, type RunSplit } from "@/components/SplitAnalyzer";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDate, fmtDuration, fmtKm, fmtPace } from "@/lib/format";

export const dynamic = "force-dynamic";
const localDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function average(values: Array<number | null>) { const valid = values.filter((value): value is number => value != null && value > 0); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; }
function comparison(value: number | null, baseline: number | null, lowerIsBetter = false) { if (value == null || baseline == null) return "Nog niet genoeg Health-data om te vergelijken"; const change = ((value - baseline) / baseline) * 100; if (Math.abs(change) < 5) return "Rond je persoonlijke basislijn"; const favorable = lowerIsBetter ? change < 0 : change > 0; return `${Math.abs(change).toFixed(0)}% ${change > 0 ? "boven" : "onder"} je basislijn${favorable ? " · gunstig signaal" : " · let op je herstel"}`; }

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run] = await db.select().from(activities).where(eq(activities.id, Number(id))).limit(1);
  if (!run) notFound();
  const runDate = localDate(run.startDate);
  const healthWindow = await db.select().from(healthMetrics).where(and(gte(healthMetrics.date, shiftDate(runDate, -21)), lte(healthMetrics.date, shiftDate(runDate, 2))));
  const baselineRows = healthWindow.filter((metric) => metric.date < runDate);
  const runDayHealth = healthWindow.find((metric) => metric.date === runDate) ?? null;
  const postHealth = healthWindow.find((metric) => metric.date === shiftDate(runDate, 1)) ?? healthWindow.find((metric) => metric.date === shiftDate(runDate, 2)) ?? null;
  const baselineHrv = average(baselineRows.slice(-14).map((metric) => metric.hrvMs));
  const baselineRhr = average(baselineRows.slice(-14).map((metric) => metric.restingHeartRate));
  const afterHrvText = comparison(postHealth?.hrvMs ?? null, baselineHrv);
  const afterRhrText = comparison(postHealth?.restingHeartRate ?? null, baselineRhr, true);
  const effortLabel = run.sufferScore == null ? "niet gemeten" : run.sufferScore >= 100 ? "zware trainingsprikkel" : run.sufferScore >= 50 ? "stevige trainingsprikkel" : "beheerste trainingsprikkel";
  const raw = run.raw && typeof run.raw === "object" && !Array.isArray(run.raw) ? run.raw as Record<string, unknown> : {};
  const splits: RunSplit[] = Array.isArray(raw.splits_metric) ? raw.splits_metric.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const split = value as Record<string, unknown>;
    if (typeof split.split !== "number" || typeof split.distance !== "number" || typeof split.moving_time !== "number" || typeof split.average_speed !== "number") return [];
    return [{ split: split.split, distance: split.distance, movingTime: split.moving_time, elevationDifference: typeof split.elevation_difference === "number" ? split.elevation_difference : 0, averageSpeed: split.average_speed, averageHeartRate: typeof split.average_heartrate === "number" ? split.average_heartrate : null }];
  }) : [];

  return (
    <div className="coach-shell min-h-screen px-4 pb-16 sm:px-7"><main className="coach-main run-analysis-shell">
      <nav className="coach-nav" aria-label="Hoofdnavigatie"><Link href="/" className="brand-mark"><AppLogo /></Link><div className="coach-nav-links"><Link href="/">Overzicht</Link><Link href="/runs" className="active">Trainingen</Link><Link href="/#doel">Doel 21,1 km</Link></div></nav>
      <header className="run-analysis-header"><Link href="/runs">← Alle trainingen</Link><span className="eyebrow">Training uitgelegd · {fmtDate(run.startDate)}</span><h1>{run.name || "Hardlooptraining"}</h1><p>{fmtKm(run.distanceM)} in {fmtDuration(run.movingTimeS)} · gemiddeld {fmtPace(run.avgPaceMinPerKm)}</p></header>
      <section className="run-story-grid" aria-label="Analyse voor, tijdens en na deze training">
        <article className="run-story-card"><span>01 · Voor</span><h2>Je startpunt</h2><p>De Health-meting rond deze dag helpt beoordelen met hoeveel herstelreserve je begon.</p><dl><div><dt>HRV</dt><dd>{runDayHealth?.hrvMs ? `${Math.round(runDayHealth.hrvMs)} ms` : "–"}</dd></div><div><dt>Rusthartslag</dt><dd>{runDayHealth?.restingHeartRate ? `${Math.round(runDayHealth.restingHeartRate)} bpm` : "–"}</dd></div><div><dt>Interpretatie</dt><dd>{runDayHealth ? "Lees deze waarden ten opzichte van je eigen basislijn, niet als losse norm." : "Geen Health-meting op deze trainingsdag."}</dd></div></dl></article>
        <article className="run-story-card featured"><span>02 · Tijdens</span><h2>Wat de run je kostte</h2><p>Strava beschrijft de prestatie; hartslag en inspanningsscore geven context over de belasting.</p><dl><div><dt>Tempo</dt><dd>{fmtPace(run.avgPaceMinPerKm)}</dd></div><div><dt>Hartslag</dt><dd>{run.avgHeartRate ? `${Math.round(run.avgHeartRate)} bpm gem. · ${Math.round(run.maxHeartRate ?? run.avgHeartRate)} max` : "Niet gemeten"}</dd></div><div><dt>Betekenis</dt><dd>{effortLabel}{run.elevationGainM ? ` · ${Math.round(run.elevationGainM)} hoogtemeters telden mee` : ""}</dd></div></dl></article>
        <article className="run-story-card"><span>03 · Na</span><h2>Hoe je lichaam reageerde</h2><p>De eerstvolgende Health-dag laat zien of herstelwaarden terugveren of tijdelijk onder druk staan.</p><dl><div><dt>HRV na afloop</dt><dd>{postHealth?.hrvMs ? `${Math.round(postHealth.hrvMs)} ms · ${afterHrvText}` : "Niet beschikbaar"}</dd></div><div><dt>Rusthartslag na afloop</dt><dd>{postHealth?.restingHeartRate ? `${Math.round(postHealth.restingHeartRate)} bpm · ${afterRhrText}` : "Niet beschikbaar"}</dd></div><div><dt>Volgende stap</dt><dd>{postHealth ? "Zijn beide signalen ongunstig én voel je vermoeidheid? Maak de volgende training rustig." : "Kijk naar gevoel en je volgende actuele Health-meting."}</dd></div></dl></article>
      </section>
      <SplitAnalyzer activityId={run.id} splits={splits} />
      <section className="run-facts"><div><span className="eyebrow">Strava-details</span><h2>De cijfers, met betekenis</h2></div><div className="run-fact-grid"><span><small>Afstand</small><strong>{fmtKm(run.distanceM)}</strong><em>omvang</em></span><span><small>Tempo</small><strong>{fmtPace(run.avgPaceMinPerKm)}</strong><em>snelheid</em></span><span><small>Hartslag</small><strong>{run.avgHeartRate ? `${Math.round(run.avgHeartRate)} bpm` : "–"}</strong><em>interne belasting</em></span><span><small>Cadans</small><strong>{run.avgCadence ? `${Math.round(run.avgCadence * 2)} spm` : "–"}</strong><em>pasfrequentie</em></span><span><small>Hoogte</small><strong>{run.elevationGainM ? `${Math.round(run.elevationGainM)} m` : "–"}</strong><em>routezwaarte</em></span><span><small>Inspanning</small><strong>{run.sufferScore ? Math.round(run.sufferScore) : "–"}</strong><em>Strava-score</em></span></div></section>
      <div className="run-analysis-actions"><Link href="/">Bekijk je advies voor vandaag</Link><a href={`https://www.strava.com/activities/${run.stravaId}`} target="_blank" rel="noopener noreferrer">Open originele activiteit op Strava ↗</a></div>
    </main></div>
  );
}
