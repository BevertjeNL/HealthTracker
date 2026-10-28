import { desc, gte, sql } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { ScatterLink } from "@/components/ScatterLink";
import { SleepBars } from "@/components/SleepBars";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDay, fmtNum, fmtSigned } from "@/lib/format";
import { buildSleepReport, fmtClock, fmtDuration, SLEEP_TARGET_MIN } from "@/lib/sleep";
import { buildTrainingHealth, shiftDay } from "@/lib/training-health";

export const dynamic = "force-dynamic";

const scoreTone = (score: number | null) => score == null ? "unknown" : score >= 80 ? "good" : score >= 60 ? "warning" : "critical";
const scoreLabel = (score: number | null) => score == null ? "Geen score" : score >= 80 ? "Goed hersteld" : score >= 60 ? "Matig" : "Kort of onrustig";

export default async function SleepPage() {
  const [runs, health] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
  ]);
  const body = buildTrainingHealth(runs, health, new Date());
  const report = buildSleepReport(health, body.loads, body.balance.ratio, new Date());
  const { latest, summary, nights, advice } = report;
  const chartNights = nights.filter((night) => night.date > shiftDay(report.today, -30));
  const age = report.latestAgeDays;

  return <div className="c-shell"><main className="c-container"><CoachNav active="body" />
    <header className="p-head">
      <div><span className="p-overline">APPLE WATCH · SLAAP</span><h1>Je slaap</h1><p>Hoe lang, hoe diep en hoe regelmatig je slaapt, en wat dat betekent voor je training. Schattingen van je Watch, geen medische meting.</p></div>
      <div className="p-head-note">{latest ? <>Laatste nacht <b>{fmtDay(latest.date, true)}</b>{age != null && age >= 2 ? ` · ${age} dagen oud` : ""}</> : "Geen slaapdata ontvangen"}</div>
    </header>

    {!latest && <section className="p-section"><p className="p-notice">Er is nog geen slaap binnengekomen. Voeg de Opdracht <b>Pulse slaap-sync</b> toe zoals beschreven in <b>docs/apple-shortcuts.md</b> (stap 7), of vul de historie eenmalig aan met het importscript voor je Apple Health-export.</p></section>}

    {latest && <>
      <section className="p-section" aria-labelledby="night-title">
        <div className="p-section-head"><div><span className="p-overline">01 · LAATSTE NACHT</span><h2 id="night-title">Hoe sliep je?</h2></div></div>
        <div className="p-split">
          <article className={`p-card p-balance p-balance-${scoreTone(latest.score)}`}>
            <span className="p-overline">SLAAPSCORE</span>
            <div className="p-balance-num"><strong>{latest.score ?? "—"}</strong></div>
            <h3>{scoreLabel(latest.score)}</h3>
            <p>{fmtDuration(latest.asleepMin)} geslapen{latest.bedtimeMin != null && latest.wakeMin != null ? `, van ${fmtClock(latest.bedtimeMin, "bedtime")} tot ${fmtClock(latest.wakeMin, "wake")}` : ""}.</p>
            <dl>{latest.scoreParts.map((part) => <div key={part.label}><dt>{part.label}</dt><dd>{fmtNum(part.points)} / {part.max}</dd></div>)}</dl>
            <small>Score = duur (tegen {fmtDuration(SLEEP_TARGET_MIN)}), diepe slaap en REM, onafgebroken slapen en een vaste inslaaptijd. Ontbrekende onderdelen tellen niet mee.</small>
          </article>
          <div className="p-card">
            {latest.stages ? <>
              <div className="p-sleep-stack" role="img" aria-label="Verdeling van de slaapfasen">{[["Diep", latest.deepMin, "var(--series-vo2)"], ["REM", latest.remMin, "var(--series-weight)"], ["Kern", latest.coreMin, "var(--series-chronic)"], ["Wakker", latest.awakeMin, "var(--series-rhr)"]].filter(([, minutes]) => (minutes as number | null) != null && (minutes as number) > 0).map(([label, minutes, color]) => <i key={label as string} style={{ flex: minutes as number, background: color as string }} title={`${label}: ${fmtDuration(minutes as number)}`} />)}</div>
              <dl className="p-sleep-stages">
                <div><dt><i style={{ background: "var(--series-vo2)" }} />Diep</dt><dd>{fmtDuration(latest.deepMin)} <small>{fmtNum(latest.deepPct, 0)}%</small></dd></div>
                <div><dt><i style={{ background: "var(--series-weight)" }} />REM</dt><dd>{fmtDuration(latest.remMin)} <small>{fmtNum(latest.remPct, 0)}%</small></dd></div>
                <div><dt><i style={{ background: "var(--series-chronic)" }} />Kern</dt><dd>{fmtDuration(latest.coreMin)}</dd></div>
                <div><dt><i style={{ background: "var(--series-rhr)" }} />Wakker</dt><dd>{fmtDuration(latest.awakeMin)}</dd></div>
              </dl>
            </> : <p className="p-empty">Deze nacht bevat geen slaapfasen. Een Watch met slaapfasen levert diep, REM en kern; dan verschijnt hier de verdeling.</p>}
            {latest.efficiencyPct != null && <p className="p-footnote">Slaapefficiëntie {fmtNum(latest.efficiencyPct, 0)}%: zo groot is het deel van je tijd in bed dat je echt sliep. Vanaf 85% is normaal.</p>}
          </div>
        </div>
      </section>

      <section className="p-section" aria-labelledby="advice-title">
        <div className="p-section-head"><div><span className="p-overline">02 · ADVIES</span><h2 id="advice-title">Wat betekent dit voor je training?</h2></div></div>
        <div className="p-stack">{advice.map((item) => <div key={item.id} className={`p-verdict p-verdict-${item.tone}`}><h3>{item.title}</h3><p>{item.detail}</p></div>)}</div>
      </section>

      <section className="p-section" aria-labelledby="week-title">
        <div className="p-section-head"><div><span className="p-overline">03 · DEZE WEEK</span><h2 id="week-title">Je ritme over de laatste nachten</h2></div></div>
        <div className="p-tiles">
          <article className="p-tile"><span className="p-metric-label">GEMIDDELD (7 NACHTEN)</span><div className="p-metric-value"><strong>{summary.avgAsleep7 == null ? "—" : fmtDuration(summary.avgAsleep7)}</strong></div><p className="p-metric-meta">{summary.avgAsleep7 == null ? `Pas vanaf 3 nachten (nu ${summary.nights7})` : summary.deltaMin != null ? <>{fmtSigned(summary.deltaMin, 0, " min")} t.o.v. de 4 weken ervoor</> : "Basislijn bouwt op"}</p></article>
          <article className={`p-tile ${summary.debtMin == null ? "" : summary.debtMin >= 240 ? "p-tile-critical" : summary.debtMin >= 120 ? "p-tile-warning" : "p-tile-good"}`}><span className="p-metric-label">SLAAPSCHULD</span><div className="p-metric-value"><strong>{summary.debtMin == null ? "—" : fmtDuration(summary.debtMin)}</strong></div><p className="p-metric-meta">Onder {fmtDuration(SLEEP_TARGET_MIN)} per nacht, over {summary.debtNights} nachten</p></article>
          <article className="p-tile"><span className="p-metric-label">REGELMAAT</span><div className="p-metric-value"><strong>{summary.bedtimeSd == null ? "—" : `±${fmtNum(summary.bedtimeSd)}`}</strong>{summary.bedtimeSd != null && <small>min</small>}</div><p className="p-metric-meta">{summary.bedtimeSd == null ? "Pas vanaf 5 nachten met tijden" : `Inslaaptijd rond ${fmtClock(summary.avgBedtimeMin, "bedtime")}, wakker rond ${fmtClock(summary.avgWakeMin, "wake")}`}</p></article>
          <article className="p-tile"><span className="p-metric-label">DIEP · REM</span><div className="p-metric-value"><strong>{summary.deepPct == null || summary.remPct == null ? "—" : `${fmtNum(summary.deepPct, 0)}% · ${fmtNum(summary.remPct, 0)}%`}</strong></div><p className="p-metric-meta">{summary.deepPct == null ? "Pas vanaf 3 nachten met fasen" : `Gemiddeld over ${summary.stageNights} nachten. Richtlijn: diep 13–23%, REM 20–25%`}</p></article>
        </div>
        <div className="p-card" style={{ marginTop: 16 }}><SleepBars nights={chartNights} /></div>
      </section>

      <section className="p-section" aria-labelledby="links-title">
        <div className="p-section-head"><div><span className="p-overline">04 · VERBANDEN</span><h2 id="links-title">Slaap, herstel en prestatie</h2></div></div>
        <p className="p-intro">We koppelen elke nacht aan je HRV de ochtend erna en aan de zuinigheid van je runs. Alleen verbanden met minstens 8 koppelingen en een duidelijke sterkte (|r| ≥ 0,25) worden als verband gemeld.</p>
        <div className="p-links">{report.links.map((link) => <ScatterLink key={link.id} link={link} />)}</div>
        <div className={`p-verdict p-verdict-${report.afterLoad.enough ? "good" : "unknown"}`} style={{ marginTop: 16 }}><h3>Slaap na een zware dag</h3><p>{report.afterLoad.text}</p></div>
      </section>
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Apple Watch × Strava</span></footer>
  </main></div>;
}
