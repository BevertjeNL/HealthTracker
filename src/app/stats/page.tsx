import Link from "next/link";
import { desc } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/format";
import { buildRunStats, DAY_PARTS, WEEKDAYS, type RunStats } from "@/lib/run-stats";

export const dynamic = "force-dynamic";

const n0 = (value: number) => Math.round(value).toLocaleString("nl-NL");
const n1 = (value: number) => value.toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dayDate = (day: string) => fmtDate(new Date(`${day}T12:00:00Z`));
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WEEKDAY_JOKE = ["Maandag: moedig begonnen is half gelopen.", "Dinsdag: de stille kracht van de week.", "Woensdag: de bergetappe midden in de week.", "Donderdag: bijna weekend, dus nog even doorbijten.", "Vrijdag: de week uitlopen.", "Zaterdag: de klassieker onder de loopdagen.", "Zondag: de lange duurloop in alle rust."];

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="st-delta st-delta-na">Te weinig runs om te vergelijken</span>;
  if (Math.abs(pct) < 3) return <span className="st-delta st-delta-flat">≈ gelijk</span>;
  return <span className={`st-delta ${pct > 0 ? "st-delta-up" : "st-delta-down"}`}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function trendLine(stats: RunStats) {
  const { trend } = stats;
  if (!trend.enough) return "Nog te weinig weken met runs voor een trend.";
  const mean = n1(trend.meanKmPerWeek);
  if (trend.direction === "up") return `Je kilometers stijgen: gemiddeld ${mean} km per week, en de lijn wijst omhoog.`;
  if (trend.direction === "down") return `Je kilometers zakken: gemiddeld ${mean} km per week, en de lijn wijst omlaag.`;
  return `Je zit stabiel op gemiddeld ${mean} km per week.`;
}

export default async function StatsPage() {
  const rows = await db.select().from(activities).orderBy(desc(activities.startDate));
  const stats = buildRunStats(rows);
  return <div className="c-shell"><main className="c-container"><CoachNav active="stats" />
    <header className="p-head"><div><span className="p-overline">JE LOOPCIJFERS</span><h1>Cijfers</h1><p>Kilometers per maand en jaar, loopdagen, series, records en een flinke dosis wetenswaardigheden.</p></div></header>
    {!stats ? <section className="c-empty"><h2>Nog geen runs gevonden.</h2><p>Verbind Strava en synchroniseer je runs om je cijfers te zien.</p><Link href="/runs" className="c-button">Naar mijn runs</Link></section> : <Stats stats={stats} />}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}

function Stats({ stats }: { stats: RunStats }) {
  const { journey, fun, records, streaks } = stats;
  const maxYear = Math.max(...stats.years.map((y) => Math.max(y.km, 1)));
  const current = stats.years[stats.years.length - 1];
  const previous = stats.years.length > 1 ? stats.years[stats.years.length - 2] : null;
  const maxMonth = Math.max(1, ...stats.years.flatMap((y) => y.months));
  const maxCompare = Math.max(1, ...current.months, ...(previous?.months ?? []));
  const maxWeek = Math.max(1, ...stats.trend.weeks.map((w) => w.km));
  const maxWeekday = Math.max(1, ...stats.weekdayRuns);
  const maxPart = Math.max(1, ...stats.dayPartRuns);
  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.runs));
  const nowMonth = Number(stats.todayText.slice(5, 7)) - 1;
  const nowYear = Number(stats.todayText.slice(0, 4));
  return <>
    <section className="st-hero" aria-label="Totaal">
      <div className="st-hero-main"><span className="c-overline">SINDS {dayDate(stats.firstDay).toUpperCase()}</span><strong>{n0(stats.totalKm)}<small> km</small></strong><p>in {n0(stats.totalRuns)} runs op {n0(stats.runDayCount)} verschillende dagen. Gemiddeld {n1(stats.avgKmPerRun)} km per run{stats.avgPace ? ` in ${fmtPace(stats.avgPace)}` : ""}.</p>
        {stats.persona && <div className="st-persona"><b>{stats.persona.title}</b><span>{stats.persona.text}</span></div>}</div>
      <div className="st-hero-side"><div className="st-chip st-chip-lime"><strong>{n1(fun.daysOnTheMove * 24)}</strong><span>uur onderweg</span></div><div className="st-chip st-chip-sky"><strong>{n0(stats.totalElev)}</strong><span>hoogtemeters</span></div><div className="st-chip st-chip-pink"><strong>{n1(fun.marathons)}</strong><span>marathons</span></div></div>
      <div className="st-journey"><div className="st-journey-top"><span>{journey.reached ? `Vanaf Amsterdam kwam je (hemelsbreed) voorbij ${journey.reached.name}.` : "Je reis vanaf Amsterdam is net begonnen."}</span>{journey.next && <span>Volgende stop: <b>{journey.next.name}</b>, nog {n0(journey.kmToNext)} km</span>}</div><div className="st-bar" role="img" aria-label={`${journey.progressPct} procent onderweg naar de volgende stop`}><i style={{ width: `${journey.progressPct}%` }} /></div></div>
    </section>

    <section className="st-section" aria-labelledby="st-vs"><div className="c-section-heading"><div><span className="c-overline">VERGELEKEN MET EERDER</span><h2 id="st-vs">Ga je vooruit?</h2></div></div>
      <div className="st-grid st-grid-4">{stats.comparisons.map((item, i) => <article className={`st-card st-c${i + 1}`} key={item.label}><span className="st-card-label">{item.label}</span><strong className="st-big">{n1(item.current.km)} <small>km</small></strong><Delta pct={item.deltaPct} /><p>Daarvoor: {n1(item.previous.km)} km in {item.previous.runs} runs.</p><small>{item.detail}</small></article>)}</div>
    </section>

    <section className="st-section" aria-labelledby="st-years"><div className="c-section-heading"><div><span className="c-overline">PER JAAR</span><h2 id="st-years">Jaar na jaar.</h2></div><span>{stats.years.length} {stats.years.length === 1 ? "jaar" : "jaren"}</span></div>
      <div className="st-years">{stats.years.map((y) => <div className="st-year-row" key={y.year}><b>{y.year}</b><div className="st-year-track"><i className="st-year-bar" style={{ width: `${(y.km / maxYear) * 100}%` }} />{y.year === nowYear && <i className="st-year-ytd" style={{ width: `${(y.ytdKm / maxYear) * 100}%` }} />}</div><strong>{n0(y.km)} km</strong><span>{y.runs} runs · {n1(y.avgKmPerWeek)} km/week · gem. {n1(y.avgKmPerRun)} km{y.avgPace ? ` · ${fmtPace(y.avgPace)}` : ""}</span></div>)}</div>
      {previous && <p className="st-note">Op dezelfde datum vorig jaar stond je op {n0(previous.ytdKm)} km, dit jaar op {n0(current.ytdKm)} km.</p>}
    </section>

    <section className="st-section" aria-labelledby="st-months"><div className="c-section-heading"><div><span className="c-overline">PER MAAND</span><h2 id="st-months">Je maandenkaart.</h2></div></div>
      <div className="st-months-wrap"><div className="st-months" role="table" aria-label="Kilometers per maand per jaar"><span />{MONTHS.map((m) => <small key={m}>{m}</small>)}<small>totaal</small>{[...stats.years].reverse().map((y) => { const best = Math.max(...y.months); return <div className="st-months-row" key={y.year}><b>{y.year}</b>{y.months.map((km, m) => { const future = y.year === nowYear && m > nowMonth; const level = future || km <= 0 ? 0 : Math.max(1, Math.ceil(Math.sqrt(km / maxMonth) * 5)); const isBest = !future && km > 0 && km === best; const isNow = y.year === nowYear && m === nowMonth; return <span key={m} className={`st-month st-lv${future ? "x" : level}${isBest ? " st-best" : ""}${isNow ? " st-now" : ""}`} title={future ? `${MONTHS[m]} ${y.year}: nog niet gelopen` : `${MONTHS[m]} ${y.year}: ${n1(km)} km${isBest ? " (beste maand van dat jaar)" : ""}`}>{future || km <= 0 ? "" : n0(km)}</span>; })}<strong className="st-month-total">{n0(y.km)}<small> km</small></strong></div>; })}</div></div>
      <div className="st-month-legend" aria-hidden><span>weinig</span>{[1, 2, 3, 4, 5].map((l) => <i key={l} className={`st-lv${l}`} />)}<span>veel</span><span className="st-month-key"><i className="st-best-key" /> beste maand van het jaar</span></div>
      {stats.records.bestMonth && <p className="st-note">Je sterkste maand ooit: <b>{monthName(stats.records.bestMonth.month)}</b> met {n0(stats.records.bestMonth.km)} km. Hoe donkerder het vlak, hoe meer kilometers.</p>}
      {previous && <><h3 className="st-sub">{current.year} tegenover {previous.year}</h3><div className="st-duo" role="img" aria-label={`Kilometers per maand in ${current.year} en ${previous.year}`}>{MONTHS.map((m, i) => <div key={m} className="st-duo-col"><div className="st-duo-bars"><i className="st-prev" style={{ height: `${(previous.months[i] / maxCompare) * 100}%` }} title={`${m} ${previous.year}: ${n1(previous.months[i])} km`} /><i className="st-cur" style={{ height: `${(current.months[i] / maxCompare) * 100}%` }} title={`${m} ${current.year}: ${n1(current.months[i])} km`} /></div><small>{m}</small></div>)}</div><div className="st-legend"><span><i className="st-cur" /> {current.year}</span><span><i className="st-prev" /> {previous.year}</span></div></>}
    </section>

    <section className="st-section" aria-labelledby="st-trend"><div className="c-section-heading"><div><span className="c-overline">TREND</span><h2 id="st-trend">Welke kant op?</h2></div></div>
      <div className="st-trend"><div className="st-weeks" role="img" aria-label="Kilometers per week over de laatste 26 weken">{stats.trend.weeks.map((w, i) => <div key={w.end} className="st-week"><i className={i >= 14 ? "st-week-recent" : ""} style={{ height: `${Math.max(2, (w.km / maxWeek) * 100)}%` }} title={`Week tot ${dayDate(w.end)}: ${n1(w.km)} km in ${w.runs} runs`} /></div>)}</div><p className="st-trend-line">{trendLine(stats)}</p><small>Laatste 26 weken, elke balk is 7 dagen. De donkere balken vormen de laatste 12 weken waarop de trend rust.</small></div>
    </section>

    <section className="st-section" aria-labelledby="st-days"><div className="c-section-heading"><div><span className="c-overline">LOOPDAGEN</span><h2 id="st-days">Wanneer loop jij?</h2></div></div>
      <div className="st-grid st-grid-2">
        <article className="st-card st-c5"><span className="st-card-label">Per weekdag</span>{stats.favoriteWeekday !== null && <p className="st-fun">{WEEKDAY_JOKE[stats.favoriteWeekday]}</p>}<div className="st-hbars">{WEEKDAYS.map((d, i) => <div className="st-hbar" key={d}><span>{d.slice(0, 2)}</span><div><i className={i === stats.favoriteWeekday ? "st-hot" : ""} style={{ width: `${(stats.weekdayRuns[i] / maxWeekday) * 100}%` }} /></div><b>{stats.weekdayRuns[i]}</b></div>)}</div></article>
        <article className="st-card st-c6"><span className="st-card-label">Per dagdeel</span>{stats.favoriteDayPart !== null && <p className="st-fun">Je loopt het vaakst in de {DAY_PARTS[stats.favoriteDayPart].label.toLowerCase()}.</p>}<div className="st-hbars">{DAY_PARTS.map((p, i) => <div className="st-hbar" key={p.label}><span className="st-wide">{p.label}</span><div><i className={i === stats.favoriteDayPart ? "st-hot" : ""} style={{ width: `${(stats.dayPartRuns[i] / maxPart) * 100}%` }} /></div><b>{stats.dayPartRuns[i]}</b></div>)}</div><small>{DAY_PARTS.map((p) => `${p.label} ${p.range}`).join(" · ")}</small></article>
      </div>
      <div className="st-heat-card"><div className="st-heat-head"><b>Het afgelopen jaar</b><span>{stats.heatmapRunDays} loopdagen · {n0(stats.heatmapKm)} km</span></div><div className="st-heat-scroll"><div className="st-heat-months">{stats.heatmapMonths.map((m, i) => <span key={i}>{m}</span>)}</div><div className="st-heat" role="img" aria-label={`${stats.heatmapRunDays} loopdagen in de afgelopen 53 weken`}>{stats.heatmap.map((col, c) => <div key={c}>{col.map((cell) => <i key={cell.day} className={`st-h${cell.future ? "x" : cell.level}`} title={cell.future ? "" : `${dayDate(cell.day)}: ${cell.km > 0 ? `${n1(cell.km)} km` : "rust"}`} />)}</div>)}</div></div><div className="st-heat-legend"><small>rust</small><i className="st-h0" /><i className="st-h1" /><i className="st-h2" /><i className="st-h3" /><i className="st-h4" /><small>15+ km</small></div></div>
      <div className="st-grid st-grid-4 st-streaks">
        <article className="st-card st-c1"><span className="st-card-label">Serie nu</span><strong className="st-big">{streaks.currentDays} <small>{streaks.currentDays === 1 ? "dag" : "dagen"}</small></strong><p>{streaks.currentWeeks} {streaks.currentWeeks === 1 ? "week" : "weken"} op rij met minimaal één run.</p></article>
        <article className="st-card st-c2"><span className="st-card-label">Langste serie</span><strong className="st-big">{streaks.longestDays.length} <small>{streaks.longestDays.length === 1 ? "dag" : "dagen"} op rij</small></strong><p>Beste weekreeks: {streaks.longestWeeks.length} weken achter elkaar.</p></article>
        <article className="st-card st-c3"><span className="st-card-label">Langste pauze</span><strong className="st-big">{streaks.longestBreak.days} <small>dagen</small></strong><p>{streaks.longestBreak.days > 0 ? `Tussen ${dayDate(streaks.longestBreak.from)} en ${dayDate(streaks.longestBreak.to)}.` : "Nog geen pauze gehad."}</p></article>
        <article className="st-card st-c4"><span className="st-card-label">Dit jaar</span><strong className="st-big">{streaks.thisYearRunDays} <small>loopdagen</small></strong><p>Dat is {Math.round(streaks.thisYearShare * 100)}% van alle dagen. {stats.daysSinceLast === 0 ? "Vandaag al gelopen." : `Laatste run: ${stats.daysSinceLast} ${stats.daysSinceLast === 1 ? "dag" : "dagen"} geleden.`}</p></article>
      </div>
    </section>

    <section className="st-section" aria-labelledby="st-records"><div className="c-section-heading"><div><span className="c-overline">RECORDS</span><h2 id="st-records">De prijzenkast.</h2></div></div>
      <div className="st-grid st-grid-3">
        {records.longest && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>🏅</span><span className="st-card-label">Langste run</span><strong className="st-big">{n1(records.longest.km)} <small>km</small></strong><p>{records.longest.name || "Hardlooptraining"} · {dayDate(records.longest.day)}</p></article>}
        {records.fastest5k && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>⚡</span><span className="st-card-label">Snelste run vanaf 5 km</span><strong className="st-big">{fmtPace(records.fastest5k.pace)}</strong><p>{n1(records.fastest5k.km)} km · {dayDate(records.fastest5k.day)}</p></article>}
        {records.fastest10k && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>🚀</span><span className="st-card-label">Snelste run vanaf 10 km</span><strong className="st-big">{fmtPace(records.fastest10k.pace)}</strong><p>{n1(records.fastest10k.km)} km · {dayDate(records.fastest10k.day)}</p></article>}
        {records.bestWeek && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>📅</span><span className="st-card-label">Beste week</span><strong className="st-big">{n1(records.bestWeek.km)} <small>km</small></strong><p>Week vanaf {dayDate(records.bestWeek.from)}</p></article>}
        {records.bestMonth && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>🗓️</span><span className="st-card-label">Beste maand</span><strong className="st-big">{n0(records.bestMonth.km)} <small>km</small></strong><p>{monthName(records.bestMonth.month)}</p></article>}
        {records.longestTime && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>⏱️</span><span className="st-card-label">Langste tijd onderweg</span><strong className="st-big">{fmtDuration(records.longestTime.timeS)}</strong><p>{n1(records.longestTime.km)} km · {dayDate(records.longestTime.day)}</p></article>}
        {records.climb && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>⛰️</span><span className="st-card-label">Meeste hoogtemeters</span><strong className="st-big">{n0(records.climb.elev)} <small>m</small></strong><p>{records.climb.name || "Hardlooptraining"} · {dayDate(records.climb.day)}</p></article>}
        {records.bestDay && records.bestDay.km > (records.longest?.km ?? 0) + 0.05 && <article className="st-card st-trophy"><span className="st-emoji" aria-hidden>✌️</span><span className="st-card-label">Meeste km op één dag</span><strong className="st-big">{n1(records.bestDay.km)} <small>km</small></strong><p>{dayDate(records.bestDay.day)}, verdeeld over meerdere runs</p></article>}
      </div>
    </section>

    <section className="st-section" aria-labelledby="st-fun"><div className="c-section-heading"><div><span className="c-overline">WETENSWAARDIGHEDEN</span><h2 id="st-fun">Nutteloos, maar leuk.</h2></div></div>
      <div className="st-grid st-grid-3">
        <article className="st-card st-c2"><span className="st-emoji" aria-hidden>🌍</span><strong className="st-big">{fun.earthPct >= 1 ? n1(fun.earthPct) : fun.earthPct.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%</strong><p>van de omtrek van de aarde heb je al gelopen.</p></article>
        <article className="st-card st-c3"><span className="st-emoji" aria-hidden>🏔️</span><strong className="st-big">{fun.everests.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}×</strong><p>de hoogte van de Mount Everest omhoog geklommen (8.849 m), in hoogtemeters opgeteld.</p></article>
        <article className="st-card st-c4"><span className="st-emoji" aria-hidden>⏳</span><strong className="st-big">{n1(fun.daysOnTheMove)} <small>dagen</small></strong><p>non-stop hardlopen. Zo lang is je totale bewegingstijd.</p></article>
        <article className="st-card st-c5"><span className="st-emoji" aria-hidden>🏃</span><strong className="st-big">{n1(fun.marathons)}</strong><p>marathons aan kilometers, of {n1(fun.marathons * 2)} halve marathons.</p></article>
        <article className="st-card st-c6"><span className="st-emoji" aria-hidden>🔁</span><strong className="st-big">{n0(stats.heatmapRunDays)} <small>loopdagen</small></strong><p>in de afgelopen 53 weken, goed voor {n0(stats.heatmapKm)} km.</p></article>
        <article className="st-card st-c1"><span className="st-emoji" aria-hidden>{stats.weekendShare >= 0.5 ? "🛋️" : "💼"}</span><strong className="st-big">{Math.round(stats.weekendShare * 100)}%</strong><p>van je kilometers loop je in het weekend.</p></article>
      </div>
      <div className="st-buckets"><h3 className="st-sub">Hoe lang loop je meestal?</h3>{stats.buckets.map((b) => <div className="st-hbar" key={b.label}><span>{b.label}</span><div><i style={{ width: `${(b.runs / maxBucket) * 100}%` }} /></div><b>{b.runs}</b></div>)}</div>
    </section>
  </>;
}
