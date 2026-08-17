import Link from "next/link";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { desc, gte } from "drizzle-orm";
import { fmtDate, fmtPace, fmtDuration, fmtKm } from "@/lib/format";
import { RunTrendsChart } from "@/components/RunTrendsChart";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

export default async function RunsPage() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const runs = await db
    .select()
    .from(activities)
    .where(gte(activities.startDate, ninetyDaysAgo))
    .orderBy(desc(activities.startDate));

  const totalDistanceM = runs.reduce((sum, r) => sum + (r.distanceM ?? 0), 0);
  const validPaces = runs.filter((r) => r.avgPaceMinPerKm).map((r) => r.avgPaceMinPerKm!);
  const avgPace = validPaces.length
    ? validPaces.reduce((a, b) => a + b, 0) / validPaces.length
    : null;
  const validHr = runs.filter((r) => r.avgHeartRate).map((r) => r.avgHeartRate!);
  const avgHr = validHr.length ? validHr.reduce((a, b) => a + b, 0) / validHr.length : null;
  const totalElevation = runs.reduce((sum, r) => sum + (r.elevationGainM ?? 0), 0);

  const chartPoints = runs
    .slice(0, 12)
    .map((r) => ({
      date: r.startDate.toISOString(),
      paceMinPerKm: r.avgPaceMinPerKm,
      avgHeartRate: r.avgHeartRate,
    }));

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-5xl flex-col gap-10">
        <header>
          <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            ← HealthTracker
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Runs
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Laatste 90 dagen, {runs.length} run{runs.length === 1 ? "" : "s"}
          </p>
        </header>

        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
              <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">
                Trends (laatste {chartPoints.length} runs)
              </h2>
              <RunTrendsChart points={chartPoints} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">
                Alle runs
              </h2>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
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
                      <tr
                        key={r.id}
                        className="border-t border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <td className="px-4 py-2">
                          <Link href={`/runs/${r.id}`} className="hover:underline">
                            {fmtDate(r.startDate)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={`/runs/${r.id}`} className="hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{fmtKm(r.distanceM)}</td>
                        <td className="px-4 py-2">{fmtDuration(r.movingTimeS)}</td>
                        <td className="px-4 py-2">{fmtPace(r.avgPaceMinPerKm)}</td>
                        <td className="px-4 py-2">
                          {r.avgHeartRate ? Math.round(r.avgHeartRate) : "-"}
                        </td>
                        <td className="px-4 py-2">
                          {r.elevationGainM ? Math.round(r.elevationGainM) + " m" : "-"}
                        </td>
                        <td className="px-4 py-2">
                          {r.avgCadence ? Math.round(r.avgCadence * 2) : "-"}
                        </td>
                        <td className="px-4 py-2">
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
