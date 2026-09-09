import Link from "next/link";
import { desc } from "drizzle-orm";
import { AppLogo } from "@/components/AppLogo";
import { SyncButton } from "@/components/SyncButton";
import { TrainingExplorer, type TrainingRun } from "@/components/TrainingExplorer";
import { db } from "@/db";
import { activities } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await db.select().from(activities).orderBy(desc(activities.startDate));
  const serialized: TrainingRun[] = runs.map((run) => {
    const raw = run.raw && typeof run.raw === "object" && !Array.isArray(run.raw) ? run.raw as Record<string, unknown> : {};
    return { id: run.id, name: run.name || "Run", date: run.startDate.toISOString(), distanceM: run.distanceM, movingTimeS: run.movingTimeS, pace: run.avgPaceMinPerKm, avgHr: run.avgHeartRate, elevationM: run.elevationGainM, cadence: run.avgCadence, sufferScore: run.sufferScore, workoutType: typeof raw.workout_type === "number" ? raw.workout_type : null };
  });

  return <div className="coach-shell min-h-screen px-4 pb-16 sm:px-7"><main className="coach-main training-workspace">
    <nav className="coach-nav" aria-label="Hoofdnavigatie"><Link href="/" className="brand-mark" aria-label="Naar Pulse dashboard"><AppLogo /></Link><div className="coach-nav-links"><Link href="/">Overzicht</Link><Link href="/runs" className="active">Trainingen</Link><Link href="/#doel">Doel 21,1 km</Link></div><SyncButton /></nav>
    <header className="training-header"><div><span className="eyebrow">Strava analyse</span><h1>Ontdek wat je<br /><em>sneller maakt.</em></h1><p>Filter je trainingen, kies je eigen statistieken en vergelijk tempo, afstand en belasting over iedere gewenste periode.</p></div><aside><strong>{runs.length}</strong><span>trainingen beschikbaar</span><p>Klik op een lange loop om afzonderlijke kilometers te analyseren.</p></aside></header>
    {runs.length ? <TrainingExplorer runs={serialized} referenceNow={new Date().toISOString()} /> : <section className="training-filter-panel"><span className="eyebrow">Nog geen trainingen</span><h2>Verbind Strava om je ontwikkeling te analyseren</h2><a className="primary-button" href="/api/strava/auth">Verbind Strava</a></section>}
  </main></div>;
}
