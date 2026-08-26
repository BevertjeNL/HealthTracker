import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fmtDate, fmtPace, fmtDuration, fmtKm } from "@/lib/format";
import { AppLogo } from "@/components/AppLogo";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
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
    <div className="min-h-screen px-6 py-12" style={{ background: "var(--background)" }}>
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <Link href="/" className="brand-mark" aria-label="Naar Pulse dashboard">
            <AppLogo />
          </Link>
          <Link href="/runs" className="mt-5 inline-block text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
            ← Alle runs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {run.name}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
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
          className="text-sm hover:underline"
          style={{ color: "var(--series-orange)" }}
        >
          Bekijk op Strava →
        </a>
      </main>
    </div>
  );
}
