import { asc, gte, sql } from "drizzle-orm";
import { BodyAlert } from "@/components/BodyAlert";
import { CoachNav } from "@/components/CoachNav";
import { MetricCard } from "@/components/MetricCard";
import { WeightChartPanel } from "@/components/WeightChartPanel";
import { db } from "@/db";
import { healthMetrics } from "@/db/schema";
import { fmtDay } from "@/lib/format";
import { amsterdamDay, buildBodyAlert, daysApart, healthTrend, shiftDay, trendSpec, type HealthKey, type HealthTrend } from "@/lib/training-health";
import { BODY_KEYS, FORM_KEYS } from "@/lib/training-health";

export const dynamic = "force-dynamic";

const COLORS: Partial<Record<HealthKey, string>> = { hrvMs: "var(--series-hrv)", restingHeartRate: "var(--series-rhr)", vo2Max: "var(--series-vo2)", weightKg: "var(--series-weight)", respiratoryRate: "var(--series-rhr)", oxygenSaturationPct: "var(--series-vo2)", steps: "var(--series-steps)", exerciseMinutes: "var(--series-run)", runningPowerW: "var(--series-run)", runningStrideLengthM: "var(--series-vo2)", runningGroundContactTimeMs: "var(--series-weight)", runningVerticalOscillationCm: "var(--series-steps)" };
const DIGITS: Partial<Record<HealthKey, number>> = { vo2Max: 1, weightKg: 1, respiratoryRate: 1, oxygenSaturationPct: 1, runningStrideLengthM: 2, runningVerticalOscillationCm: 1 };
const HERSTEL: HealthKey[] = ["hrvMs", "restingHeartRate", "respiratoryRate", "oxygenSaturationPct"];
const CONDITIE: HealthKey[] = ["vo2Max", "weightKg", "steps", "exerciseMinutes"];

export default async function BodyPage() {
  const rows = await db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 800`)).orderBy(asc(healthMetrics.date));
  const weightRows = await db.select({ date: healthMetrics.date, weightKg: healthMetrics.weightKg }).from(healthMetrics).where(sql`${healthMetrics.weightKg} is not null`).orderBy(asc(healthMetrics.date));
  const today = amsterdamDay(new Date());
  const trends = Object.fromEntries([...BODY_KEYS, ...FORM_KEYS].map((key) => [key, healthTrend(rows, key, today)])) as Record<HealthKey, HealthTrend>;
  const alert = buildBodyAlert(BODY_KEYS.map((key) => trends[key]));
  const latest = rows.at(-1)?.date ?? null;
  const ageDays = latest ? daysApart(today, latest) : null;
  const coverage = [...BODY_KEYS, ...FORM_KEYS].map((key) => {
    const spec = trendSpec(key);
    const withValue = rows.filter((row) => row[key] != null);
    const lastDate = withValue.at(-1)?.date ?? null;
    return { key, label: spec.label, lastDate, age: lastDate ? daysApart(today, lastDate) : null, last30: withValue.filter((row) => row.date > shiftDay(today, -30)).length };
  });
  const formStale = FORM_KEYS.every((key) => trends[key].current == null);

  const grid = (keys: HealthKey[]) => keys.map((key) => <MetricCard key={key} trend={trends[key]} color={COLORS[key] ?? "var(--series-run)"} digits={DIGITS[key] ?? 0} />);

  return <div className="c-shell"><main className="c-container"><CoachNav active="body" />
    <header className="p-head">
      <div><span className="p-overline">APPLE HEALTH</span><h1>Je lichaam</h1><p>Elke waarde tegenover je eigen basislijn: het gemiddelde van de 7 dagen daarvoor ligt naast die van de 28 dagen ervoor. Eén meting is geen oordeel.</p></div>
      <div className="p-head-note">{latest ? <>Laatste data <b>{fmtDay(latest, true)}</b>{ageDays != null && ageDays >= 2 ? ` · ${ageDays} dagen oud` : ""}</> : "Geen Health-data ontvangen"}</div>
    </header>

    {alert.level !== "ok" && <BodyAlert alert={alert} healthAgeDays={ageDays} />}

    <section className="p-section" aria-labelledby="herstel-title">
      <div className="p-section-head"><div><span className="p-overline">HERSTEL</span><h2 id="herstel-title">Hoe goed herstel je?</h2></div></div>
      <div className="p-tiles">{grid(HERSTEL)}</div>
    </section>

    <section className="p-section" aria-labelledby="conditie-title">
      <div className="p-section-head"><div><span className="p-overline">CONDITIE EN BEWEGING</span><h2 id="conditie-title">Je dagelijkse basis</h2></div></div>
      <div className="p-tiles">{grid(CONDITIE)}</div>
    </section>

    <section className="p-section" aria-labelledby="vorm-title">
      <div className="p-section-head"><div><span className="p-overline">LOOPVORM · APPLE WATCH</span><h2 id="vorm-title">Hoe je loopt</h2></div></div>
      {formStale && <p className="p-notice">Er zijn de afgelopen twee maanden geen loopvorm-metingen ontvangen. Loopvermogen, pasbreedte, grondcontact en verticale beweging staan in Health, maar je Shortcut stuurt ze niet mee. Zie <b>docs/apple-shortcuts.md</b> om ze toe te voegen.</p>}
      <div className="p-tiles">{grid(FORM_KEYS)}</div>
    </section>

    <section className="p-section" id="gewicht" aria-label="Gewicht">
      <WeightChartPanel points={weightRows.map((row) => ({ date: row.date, value: row.weightKg }))} today={today} />
    </section>

    <section className="p-section" aria-labelledby="coverage-title">
      <div className="p-section-head"><div><span className="p-overline">DATAKWALITEIT</span><h2 id="coverage-title">Wat komt er binnen uit Apple Health?</h2></div></div>
      <div className="p-card p-coverage"><table><thead><tr><th>Meting</th><th>Laatste waarde</th><th>Dagen met data (30 d)</th></tr></thead><tbody>{coverage.map((item) => <tr key={item.key} className={item.age == null || item.age > 14 ? "stale" : ""}><td>{item.label}</td><td>{item.lastDate ? `${fmtDay(item.lastDate, true)} (${item.age === 0 ? "vandaag" : `${item.age} d geleden`})` : "nooit ontvangen"}</td><td>{item.last30}</td></tr>)}</tbody></table>
      <p className="p-footnote">Metingen die langer dan twee weken geleden zijn, tellen niet mee in je herstelbeeld. Slaap wordt bewust niet gebruikt.</p></div>
    </section>
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
