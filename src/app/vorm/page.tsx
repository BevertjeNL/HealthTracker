import { desc, gte, sql } from "drizzle-orm";
import { BalanceChart } from "@/components/BalanceChart";
import { BodyAlert } from "@/components/BodyAlert";
import { CoachNav } from "@/components/CoachNav";
import { DotTrend } from "@/components/DotTrend";
import { MetricCard } from "@/components/MetricCard";
import { ResponseBars } from "@/components/ResponseBars";
import { ScatterLink } from "@/components/ScatterLink";
import { WeekChart } from "@/components/WeekChart";
import { db } from "@/db";
import { activities, healthMetrics } from "@/db/schema";
import { fmtDay, fmtNum } from "@/lib/format";
import { buildRunAnalysis, formatTime, toAnalysisRun } from "@/lib/run-analysis";
import { buildTrainingHealth } from "@/lib/training-health";

export const dynamic = "force-dynamic";

export default async function FormPage() {
  const [runs, health] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
  ]);
  const body = buildTrainingHealth(runs, health, new Date());
  const analysis = buildRunAnalysis(runs.map(toAnalysisRun), new Date());
  const weeks = body.weeks;
  const fit = body.fitness.efficiency;
  const recent4 = weeks.slice(-4);
  const loadValid = weeks.filter((week) => week.runs > 0).length >= 3;

  return <div className="c-shell"><main className="c-container"><CoachNav active="form" />
    <header className="p-head">
      <div><span className="p-overline">TRAINING × APPLE HEALTH</span><h1>Je vorm</h1><p>Zo reageert je lichaam op wat je doet: belasting, herstel, fitness en gewicht in één beeld.</p></div>
      <div className="p-head-note">{body.latestHealthDate ? <>Health t/m <b>{fmtDay(body.latestHealthDate, true)}</b>{body.healthAgeDays != null && body.healthAgeDays >= 2 ? ` · ${body.healthAgeDays} dagen oud` : ""}</> : "Geen Health-data"}</div>
    </header>

    {body.alert.level !== "ok" && <BodyAlert alert={body.alert} healthAgeDays={body.healthAgeDays} />}

    <section className="p-section" aria-labelledby="week-title">
      <div className="p-section-head"><div><span className="p-overline">01 · TRAINING EN HERSTEL SAMEN</span><h2 id="week-title">Elke week: kilometers naast je HRV</h2></div></div>
      <div className="p-card">
        {loadValid ? <WeekChart weeks={weeks} /> : <p className="p-empty">Nog te weinig loopweken voor een weekgrafiek.</p>}
        <div className="p-card-foot">
          <span><b>{fmtNum(recent4.reduce((sum, week) => sum + week.km, 0), 0)} km</b> in de laatste 4 weken</span>
          <span>Een HRV die tijdens een zwaardere week zakt en erna terugkomt is gezond herstel. Blijft hij dalen terwijl je volume stijgt? Neem een rustweek.</span>
        </div>
      </div>
    </section>

    {analysis.insights.length > 0 && <section className="p-section" aria-labelledby="notice-title">
      <div className="p-section-head"><div><span className="p-overline">WAT VALT OP</span><h2 id="notice-title">Je training in patronen</h2></div></div>
      <div className="p-list">{analysis.insights.slice(0, 5).map((item) => <div className="p-card" key={item.id}><span className={`p-badge p-badge-${item.tone === "good" ? "better" : item.tone === "info" ? "flat" : "worse"}`}>{item.area}</span> <b>{item.title}</b><p>{item.evidence}</p><p className="p-jrow-do"><b>Doe dit:</b> {item.advice}</p></div>)}</div>
      {analysis.predictions && <p className="p-footnote">Voorspelling op basis van {analysis.predictions.basis}: {analysis.predictions.items.map((item) => `${item.label} ${formatTime(item.timeS)}`).join(" · ")}.</p>}
    </section>}

    <section className="p-section" id="belasting" aria-labelledby="balance-title">
      <div className="p-section-head"><div><span className="p-overline">02 · BELASTING</span><h2 id="balance-title">Doe je meer dan je lichaam gewend is?</h2></div></div>
      <div className="p-split">
        <article className={`p-card p-balance p-balance-${body.balance.tone}`}>
          <span className="p-overline">LAATSTE 7 DAGEN ÷ JE NORMALE WEEK</span>
          <div className="p-balance-num"><strong>{body.balance.ratio == null ? "—" : `${fmtNum(body.balance.ratio, 2)}×`}</strong></div>
          <h3>{body.balance.label}</h3>
          <p>{body.balance.detail}</p>
          <dl><div><dt>Laatste 7 dagen</dt><dd>{fmtNum(body.balance.acute)}</dd></div><div><dt>Normale week</dt><dd>{fmtNum(body.balance.chronic)}</dd></div></dl>
          <small>Belasting = duur × hartslagintensiteit (Banister). Runs zonder hartslag worden geschat op je gewone intensiteit. Veilige zone: 0,8–1,3×.</small>
        </article>
        <div className="p-card"><BalanceChart days={body.days} /></div>
      </div>
    </section>

    <section className="p-section" id="fitness" aria-labelledby="fit-title">
      <div className="p-section-head"><div><span className="p-overline">03 · FITNESS</span><h2 id="fit-title">Word je fitter?</h2></div></div>
      <div className="p-split p-split-wide">
        <div className="p-card">
          <div className={`p-verdict p-verdict-${body.fitness.verdict.tone}`}><h3>{body.fitness.verdict.label}</h3><p>{body.fitness.verdict.detail}</p></div>
          <DotTrend points={fit.series} />
          <p className="p-footnote">Zuinigheid = meter per hartslagslag, vergeleken binnen hetzelfde runtype ({fit.recentRuns} runs de laatste 2 maanden, {fit.previousRuns} de 2 maanden ervoor). Hitte, wind en hoogteverschil blijven ruis.</p>
        </div>
        <div className="p-stack">
          <MetricCard trend={body.trends.vo2Max} color="var(--series-vo2)" digits={1} note="Apple Watch-schatting; schommelt met de weersomstandigheden." />
          <MetricCard trend={body.trends.runningPowerW} color="var(--series-run)" note="Loopvermogen van je Watch tijdens runs." />
        </div>
      </div>
    </section>

    <section className="p-section" aria-labelledby="resp-title">
      <div className="p-section-head"><div><span className="p-overline">04 · JOUW HERSTELPROFIEL</span><h2 id="resp-title">Hoe reageert jouw lichaam op belasting?</h2></div></div>
      <div className="p-card"><ResponseBars profile={body.response} /></div>
    </section>

    <section className="p-section" aria-labelledby="links-title">
      <div className="p-section-head"><div><span className="p-overline">05 · VERBANDEN</span><h2 id="links-title">Wat Health zegt over je prestatie</h2></div></div>
      <p className="p-intro">We koppelen elke run aan je Health-data van die dag en kijken of die samenhangt met hoe zuinig je liep. Alleen verbanden met minstens 8 runs en een duidelijke sterkte (|r| ≥ 0,25) worden als verband gemeld.</p>
      <div className="p-links">{body.links.map((link) => <ScatterLink key={link.id} link={link} />)}</div>
    </section>

    <section className="p-section" aria-labelledby="weight-title">
      <div className="p-section-head"><div><span className="p-overline">GEWICHT EN VOLUME</span><h2 id="weight-title">Je lichaamstrends</h2></div></div>
      <div className="p-tiles p-tiles-3">
        <MetricCard trend={body.trends.weightKg} color="var(--series-weight)" digits={1} href="/lichaam#gewicht" />
        <MetricCard trend={body.trends.steps} color="var(--series-steps)" href="/lichaam" note="Alle dagelijkse stappen, inclusief je runs." />
        <MetricCard trend={body.trends.exerciseMinutes} color="var(--series-run)" href="/lichaam" />
      </div>
    </section>
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
