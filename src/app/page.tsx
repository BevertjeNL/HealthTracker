import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtPace(minPerKm?: number | null) {
  if (!minPerKm) return "-";
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

export default async function Home() {
  const [recentActivities, recentMetrics] = await Promise.all([
    db.select().from(activities).orderBy(desc(activities.startDate)).limit(10),
    db.select().from(healthMetrics).orderBy(desc(healthMetrics.date)).limit(14),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex max-w-4xl flex-col gap-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            HealthTracker
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Strava-runs en dagelijkse Apple Health-data op één plek.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">
            Recente runs
          </h2>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nog geen activiteiten. Verbind Strava via{" "}
              <a className="underline" href="/api/strava/auth">
                /api/strava/auth
              </a>{" "}
              en sync daarna via <code>/api/strava/sync</code>.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Datum</th>
                    <th className="px-4 py-2">Naam</th>
                    <th className="px-4 py-2">Afstand</th>
                    <th className="px-4 py-2">Tempo</th>
                    <th className="px-4 py-2">Gem. HR</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.map((a) => (
                    <tr key={a.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-2">{fmtDate(a.startDate)}</td>
                      <td className="px-4 py-2">{a.name}</td>
                      <td className="px-4 py-2">
                        {a.distanceM ? (a.distanceM / 1000).toFixed(2) + " km" : "-"}
                      </td>
                      <td className="px-4 py-2">{fmtPace(a.avgPaceMinPerKm)}</td>
                      <td className="px-4 py-2">
                        {a.avgHeartRate ? Math.round(a.avgHeartRate) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-black dark:text-zinc-50">
            Dagelijkse gezondheidsdata (laatste 14 dagen)
          </h2>
          {recentMetrics.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nog geen data. Stel Health Auto Export in om te posten naar{" "}
              <code>/api/health/ingest</code>.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2">Datum</th>
                    <th className="px-4 py-2">Rust-HR</th>
                    <th className="px-4 py-2">HRV</th>
                    <th className="px-4 py-2">Slaap (u)</th>
                    <th className="px-4 py-2">Stappen</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMetrics.map((m) => (
                    <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-2">{fmtDate(m.date)}</td>
                      <td className="px-4 py-2">{m.restingHeartRate ?? "-"}</td>
                      <td className="px-4 py-2">{m.hrvMs ?? "-"}</td>
                      <td className="px-4 py-2">{m.sleepHours ?? "-"}</td>
                      <td className="px-4 py-2">{m.steps ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
