import Link from "next/link";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { desc, gte } from "drizzle-orm";
import { fmtDate, fmtPace, fmtKm } from "@/lib/format";
import { weightSummary, runPerformanceSummary, buildInsights } from "@/lib/insights";
import { StatTile } from "@/components/StatTile";
import { InsightCard } from "@/components/InsightCard";
import { TrendChart } from "@/components/TrendChart";

export const dynamic = "force-dynamic";

function fmtPaceTick(v: number) {
  const min = Math.floor(v);
  const sec = Math.round((v - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default async function Home() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [runs, metrics] = await Promise.all([
    db
      .select()
      .from(activities)
      .where(gte(activities.startDate, ninetyDaysAgo))
      .orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, ninetyDaysAgo.toISOString().slice(0, 10))),
  ]);

  const recentRuns = runs.slice(0, 5);
  const hasData = runs.length > 0 || metrics.length > 0;

  const weight = weightSummary(metrics);
  const perf = runPerformanceSummary(runs, metrics);
  const insights = buildInsights(runs, metrics);

  return (
    <div className="min-h-screen px-6 py-12" style={{ background: "var(--background)" }}>
      <main className="mx-auto flex max-w-5xl flex-col gap-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            HealthTracker
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Wat je gewicht, herstel en runs je écht vertellen — laatste 90 dagen.
          </p>
        </header>

        {!hasData ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Nog geen data. Verbind Strava via{" "}
            <a className="underline" href="/api/strava/auth">
              /api/strava/auth
            </a>{" "}
            en stel Health Auto Export in om te posten naar <code>/api/health/ingest</code>.
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile
                label="Gewicht"
                value={weight.current != null ? `${weight.current.toFixed(1)} kg` : "-"}
                delta={
                  weight.deltaKg != null
                    ? `${weight.deltaKg > 0 ? "+" : ""}${weight.deltaKg.toFixed(1)} kg / ${weight.deltaPeriodDays}d`
                    : null
                }
                deltaIsGood={weight.deltaKg != null && weight.deltaKg < 0}
                trend={weight.trend}
                trendColor="var(--series-blue)"
              />
              <StatTile
                label="VO2max"
                value={perf.vo2Trend.at(-1)?.value?.toFixed(1) ?? "-"}
                delta={
                  perf.vo2Trend.length >= 2 && perf.vo2Trend[0].value != null && perf.vo2Trend.at(-1)!.value != null
                    ? `${(perf.vo2Trend.at(-1)!.value! - perf.vo2Trend[0].value!) >= 0 ? "+" : ""}${(perf.vo2Trend.at(-1)!.value! - perf.vo2Trend[0].value!).toFixed(1)} / 90d`
                    : null
                }
                deltaIsGood={
                  perf.vo2Trend.length >= 2 &&
                  perf.vo2Trend.at(-1)!.value != null &&
                  perf.vo2Trend[0].value != null &&
                  perf.vo2Trend.at(-1)!.value! > perf.vo2Trend[0].value!
                }
                trend={perf.vo2Trend}
                trendColor="var(--series-aqua)"
              />
              <StatTile
                label="Tempo (laatste runs)"
                value={perf.recentAvgPace != null ? fmtPace(perf.recentAvgPace) : "-"}
                delta={
                  perf.paceDeltaMinPerKm != null
                    ? `${perf.paceDeltaMinPerKm > 0 ? "+" : ""}${Math.round(perf.paceDeltaMinPerKm * 60)}s/km vs vorig blok`
                    : null
                }
                deltaIsGood={perf.paceDeltaMinPerKm != null && perf.paceDeltaMinPerKm < 0}
                trend={perf.paceTrend}
                trendColor="var(--series-orange)"
              />
              <StatTile
                label="Runs (90d)"
                value={String(runs.length)}
                trend={undefined}
              />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                Inzichten
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {insights.map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </div>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <TrendChart
                title="Gewicht (7-daags gemiddelde)"
                points={weight.trend}
                color="var(--series-blue)"
                formatValue={(v) => `${v.toFixed(1)} kg`}
                formatTick={(v) => v.toFixed(0)}
              />
              <TrendChart
                title="Tempo per run"
                points={perf.paceTrend}
                color="var(--series-orange)"
                formatValue={(v) => `${fmtPaceTick(v)} /km`}
                formatTick={fmtPaceTick}
                reversed
              />
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                  Recente runs
                </h2>
                {runs.length > 0 && (
                  <Link href="/runs" className="text-sm hover:underline" style={{ color: "var(--series-orange)" }}>
                    Alle runs & trends →
                  </Link>
                )}
              </div>
              {recentRuns.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Nog geen activiteiten gesynchroniseerd.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentRuns.map((a) => (
                    <Link
                      key={a.id}
                      href={`/runs/${a.id}`}
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors hover:opacity-80"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
                    >
                      <div>
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {a.name}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {fmtDate(a.startDate)}
                        </p>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div>
                          <p style={{ color: "var(--text-primary)" }}>{fmtKm(a.distanceM)}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            afstand
                          </p>
                        </div>
                        <div>
                          <p style={{ color: "var(--text-primary)" }}>{fmtPace(a.avgPaceMinPerKm)}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            tempo
                          </p>
                        </div>
                        <div>
                          <p style={{ color: "var(--text-primary)" }}>
                            {a.avgHeartRate ? Math.round(a.avgHeartRate) : "-"}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            bpm
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
