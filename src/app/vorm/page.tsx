import type { Metadata } from "next";
import { desc, gte, sql } from "drizzle-orm";
import { BalanceChart } from "@/components/BalanceChart";
import { CoachNav } from "@/components/CoachNav";
import { DotTrend } from "@/components/DotTrend";
import { ResponseBars } from "@/components/ResponseBars";
import { ScatterLink } from "@/components/ScatterLink";
import { WeekChart } from "@/components/WeekChart";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDay, fmtNum } from "@/lib/format";
import { buildTrainingHealth } from "@/lib/training-health";
import { requirePageSession } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Vorm | Pulse" };
export const dynamic = "force-dynamic";

export default async function FormPage() {
  await requirePageSession();
  const [runs, health] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
  ]);
  const body = buildTrainingHealth(runs, health, new Date());
  const weeks = body.weeks;
  const fit = body.fitness.efficiency;
  const recent4 = weeks.slice(-4);
  const loadValid = weeks.filter((week) => week.runs > 0).length >= 3;

  return <div className="c-shell"><main id="main-content" className="c-container"><CoachNav active="form" />
    <header className="p-head">
      <div><span className="p-overline">TRAINING × APPLE HEALTH</span><h1>Je vorm</h1><p>Belasting, herstel en fitness naast elkaar.</p></div>
      <div className="p-head-note">{body.latestHealthDate ? <>Health t/m <b>{fmtDay(body.latestHealthDate, true)}</b>{body.healthAgeDays != null && body.healthAgeDays >= 2 ? ` · ${body.healthAgeDays} dagen oud` : ""}</> : "Geen Health-data"}</div>
    </header>

    <section className="p-section" aria-labelledby="week-title">
      <div className="p-section-head"><div><span className="p-overline">01 · TRAINING EN HERSTEL SAMEN</span><h2 id="week-title">Elke week: kilometers naast je HRV</h2></div></div>
      <div className="p-card">
        {loadValid ? <WeekChart weeks={weeks} /> : <p className="p-empty">Nog te weinig loopweken voor een weekgrafiek.</p>}
        <div className="p-card-foot">
          <span><b>{fmtNum(recent4.reduce((sum, week) => sum + week.km, 0), 0)} km</b> in de laatste 4 weken</span>
          <span>Zakt je HRV in een zware week en komt hij terug? Dan herstel je goed. Blijft hij dalen terwijl je volume stijgt? Neem een rustweek.</span>
        </div>
      </div>
    </section>

    <section className="p-section" id="belasting" aria-labelledby="balance-title">
      <div className="p-section-head"><div><span className="p-overline">02 · BELASTING</span><h2 id="balance-title">Doe je meer dan je lichaam gewend is?</h2></div></div>
      <div className="p-split">
        <article className={`p-card p-balance p-balance-${body.balance.tone}`}>
          <span className="p-overline">LAATSTE 7 DAGEN ÷ JE NORMALE WEEK</span>
          <div className="p-balance-num"><strong>{body.balance.ratio == null ? "—" : `${fmtNum(body.balance.ratio, 2)}×`}</strong></div>
          <h3>{body.balance.label}</h3>
          <p>{body.balance.detail}</p>
          <dl><div><dt>Laatste 7 dagen</dt><dd>{fmtNum(body.balance.acute)}</dd></div><div><dt>Normale week</dt><dd>{fmtNum(body.balance.chronic)}</dd></div></dl>
          <small>Belasting = duur × hartslagintensiteit. Runs zonder hartslag zijn geschat. Veilige zone: 0,8–1,3×.</small>
        </article>
        <div className="p-card"><BalanceChart days={body.days} /></div>
      </div>
    </section>

    <section className="p-section" id="fitness" aria-labelledby="fit-title">
      <div className="p-section-head"><div><span className="p-overline">03 · FITNESS</span><h2 id="fit-title">Word je fitter?</h2></div></div>
      <div className="p-card">
          <div className={`p-verdict p-verdict-${body.fitness.verdict.tone}`}><h3>{body.fitness.verdict.label}</h3><p>{body.fitness.verdict.detail}</p></div>
          <DotTrend points={fit.series} />
          <p className="p-footnote">Zuinigheid = meter per hartslagslag, binnen hetzelfde runtype ({fit.recentRuns} runs de laatste 2 maanden, {fit.previousRuns} de 2 maanden ervoor). Hitte en wind blijven ruis.</p>
      </div>
    </section>

    <section className="p-section" aria-labelledby="resp-title">
      <div className="p-section-head"><div><span className="p-overline">04 · JOUW HERSTELPROFIEL</span><h2 id="resp-title">Hoe reageert jouw lichaam op belasting?</h2></div></div>
      <div className="p-card"><ResponseBars profile={body.response} /></div>
    </section>

    <section className="p-section" aria-labelledby="links-title">
      <div className="p-section-head"><div><span className="p-overline">05 · VERBANDEN</span><h2 id="links-title">Wat Health zegt over je prestatie</h2></div></div>
      <p className="p-intro">Elke run gekoppeld aan je Health-data. Alleen verbanden vanaf 8 runs en met |r| ≥ 0,25 tellen.</p>
      <div className="p-links">{body.links.map((link) => <ScatterLink key={link.id} link={link} />)}</div>
    </section>

    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
