import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fmtDate, fmtPace, fmtDuration, fmtKm } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">{value}</p>
    </div>
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, Number(id)))
    .limit(1);

  if (!run) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <Link href="/runs" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← Alle runs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {run.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {fmtDate(run.startDate)} · {run.type}
          </p>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Afstand" value={fmtKm(run.distanceM)} />
          <Stat label="Bewegingstijd" value={fmtDuration(run.movingTimeS)} />
          <Stat label="Totale tijd" value={fmtDuration(run.elapsedTimeS)} />
          <Stat label="Gem. tempo" value={fmtPace(run.avgPaceMinPerKm)} />
          <Stat
            label="Gem. hartslag"
            value={run.avgHeartRate ? Math.round(run.avgHeartRate) + " bpm" : "-"}
          />
          <Stat
            label="Max hartslag"
            value={run.maxHeartRate ? Math.round(run.maxHeartRate) + " bpm" : "-"}
          />
          <Stat
            label="Hoogtemeters"
            value={run.elevationGainM ? Math.round(run.elevationGainM) + " m" : "-"}
          />
          <Stat
            label="Cadans"
            value={run.avgCadence ? Math.round(run.avgCadence * 2) + " spm" : "-"}
          />
          <Stat
            label="Inspanningsscore"
            value={run.sufferScore ? Math.round(run.sufferScore).toString() : "-"}
          />
        </section>

        <a
          href={`https://www.strava.com/activities/${run.stravaId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-orange-600 hover:underline dark:text-orange-400"
        >
          Bekijk op Strava →
        </a>
      </main>
    </div>
  );
}
