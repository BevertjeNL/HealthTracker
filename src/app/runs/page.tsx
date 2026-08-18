import Link from "next/link";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { desc, gte, sql } from "drizzle-orm";
import { fmtDate, fmtPace, fmtDuration, fmtKm } from "@/lib/format";
import { RunTrendsChart } from "@/components/RunTrendsChart";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

const RANGES = {
  "3m": { label: "3 mnd", days: 90 },
  "6m": { label: "6 mnd", days: 180 },
  "1y": { label: "1 jaar", days: 365 },
  "2y": { label: "2 jaar", days: 730 },
  alles: { label: "Alles", days: null },
} as const;

type RangeKey = keyof typeof RANGES;

function isRangeKey(v: string | undefined): v is RangeKey {
  return !!v && v in RANGES;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : "1y";
  const { days } = RANGES[range];
  const since =
    days != null
      ? sql<Date>`CURRENT_TIMESTAMP - (${days} * INTERVAL '1 day')`
      : new Date(0);

  const runs = await db
    .select()
    .from(activities)
    .where(gte(activities.startDate, since))
    .orderBy(desc(activities.startDate));

  const totalDistanceM = runs.reduce((sum, r) => sum + (r.distanceM ?? 0), 0);
  const validPaces = runs.filter((r) => r.avgPaceMinPerKm).map((r) => r.avgPaceMinPerKm!);
  const avgPace = validPaces.length
    ? validPaces.reduce((a, b) => a + b, 0) / validPaces.length
    : null;
  const validHr = runs.filter((r) => r.avgHeartRate).map((r) => r.avgHeartRate!);
  const avgHr = validHr.length ? validHr.reduce((a, b) => a + b, 0) / validHr.length : null;
  const totalElevation = runs.reduce((sum, r) => sum + (r.elevationGainM ?? 0), 0);

  // All runs in range (RunTrendsChart reverses to oldest-first internally) — the chart
  // scrolls/zooms via a brush, so we don't pre-truncate to a fixed count like before.
  const chartPoints = runs.map((r) => ({
    date: r.startDate.toISOString(),
    paceMinPerKm: r.avgPaceMinPerKm,
    avgHeartRate: r.avgHeartRate,
  }));

  return (
    <div className="min-h-screen px-6 py-12" style={{ background: "var(--background)" }}>
      <main className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
              ← HealthTracker
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Runs
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {RANGES[range].label}, {runs.length} run{runs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <SyncButton />
            <nav className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
              {(Object.keys(RANGES) as RangeKey[]).map((key) => (
                <Link
                  key={key}
                  href={key === "1y" ? "/runs" : `/runs?range=${key}`}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    key === range
                      ? { background: "var(--series-orange)", color: "#fff" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  {RANGES[key].label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {runs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Nog geen runs gevonden. Verbind Strava via{" "}
            <a className="underline" href="/api/strava/auth">
              /api/strava/auth
            </a>{" "}
            en sync daarna via <code>/api/strava/sync</code>.
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Totale afstand" value={fmtKm(totalDistanceM)} />
              <StatCard label="Gem. tempo" value={fmtPace(avgPace)} />
              <StatCard label="Gem. hartslag" value={avgHr ? Math.round(avgHr) + " bpm" : "-"} />
              <StatCard label="Hoogtemeters" value={Math.round(totalElevation) + " m"} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                Trends ({chartPoints.length} runs — sleep de balk onderin om in/uit te zoomen)
              </h2>
              <RunTrendsChart points={chartPoints} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                Alle runs
              </h2>
              <div
                className="overflow-x-auto rounded-xl"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
              >
                <table className="w-full text-sm">
                  <thead className="text-left" style={{ color: "var(--text-muted)" }}>
                    <tr>
                      <th className="px-4 py-2">Datum</th>
                      <th className="px-4 py-2">Naam</th>
                      <th className="px-4 py-2">Afstand</th>
                      <th className="px-4 py-2">Duur</th>
                      <th className="px-4 py-2">Tempo</th>
                      <th className="px-4 py-2">Gem. HR</th>
                      <th className="px-4 py-2">Hoogte</th>
                      <th className="px-4 py-2">Cadans</th>
                      <th className="px-4 py-2">Inspanning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-2">
                          <Link href={`/runs/${r.id}`} className="hover:underline" style={{ color: "var(--text-primary)" }}>
                            {fmtDate(r.startDate)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={`/runs/${r.id}`} className="hover:underline" style={{ color: "var(--text-primary)" }}>
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{fmtKm(r.distanceM)}</td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{fmtDuration(r.movingTimeS)}</td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>{fmtPace(r.avgPaceMinPerKm)}</td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                          {r.avgHeartRate ? Math.round(r.avgHeartRate) : "-"}
                        </td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                          {r.elevationGainM ? Math.round(r.elevationGainM) + " m" : "-"}
                        </td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                          {r.avgCadence ? Math.round(r.avgCadence * 2) : "-"}
                        </td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                          {r.sufferScore ? Math.round(r.sufferScore) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
