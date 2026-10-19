"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDay, fmtNum, fmtSigned } from "@/lib/format";
import { badgeLabel, badgeTone, describeTrend, METRIC_GUIDE } from "@/lib/metric-guide";
import type { HealthKey, HealthTrend } from "@/lib/training-health";
import { aggregateWeekly, InteractiveSpark, type SparkPoint } from "./InteractiveSpark";

const PERIODS = [{ days: 30, label: "30 dagen" }, { days: 90, label: "90 dagen" }, { days: 180, label: "6 maanden" }, { days: 365, label: "1 jaar" }, { days: 730, label: "2 jaar" }];
const WEEKLY_FROM = 200;

export type ExplorerGroup = { overline: string; title: string; notice?: ReactNode; items: { trend: HealthTrend; color: string; digits: number }[] };

const dayMs = (date: string) => new Date(`${date}T12:00:00Z`).getTime();
const shift = (date: string, days: number) => new Date(dayMs(date) + days * 86_400_000).toISOString().slice(0, 10);

function windowed(trend: HealthTrend, today: string, days: number): SparkPoint[] {
  const from = shift(today, -days);
  return trend.series.filter((point): point is SparkPoint => point.value != null && point.date >= from);
}

function rolling7(points: SparkPoint[]) {
  return points.map((point) => {
    const from = dayMs(point.date) - 6 * 86_400_000;
    const inside = points.filter((other) => dayMs(other.date) >= from && dayMs(other.date) <= dayMs(point.date));
    return inside.reduce((sum, other) => sum + other.value, 0) / inside.length;
  });
}

function Detail({ trend, color, digits, today, days, onClose }: { trend: HealthTrend; color: string; digits: number; today: string; days: number; onClose: () => void }) {
  const [showAvg, setShowAvg] = useState(true);
  const guide = METRIC_GUIDE[trend.key];
  const text = describeTrend(trend, guide);
  const daily = windowed(trend, today, days);
  const weekly = days >= WEEKLY_FROM;
  const averages = rolling7(daily);
  const data = (weekly ? aggregateWeekly(daily).map((point) => ({ t: dayMs(point.date), value: point.value, avg: null as number | null, date: point.date })) : daily.map((point, index) => ({ t: dayMs(point.date), value: point.value, avg: averages[index], date: point.date })));
  const band: [number, number] | null = trend.baseline != null && trend.baselineSd != null ? [trend.baseline - trend.baselineSd, trend.baseline + trend.baselineSd] : null;
  const nowFrom = dayMs(shift(today, -trend.recentDays - Math.max(0, trend.currentAgeDays ?? 0)));
  const values = data.flatMap((point) => [point.value, ...(point.avg != null ? [point.avg] : [])]).concat(band ?? []);
  // Uitschieters (bijvoorbeeld één meting ver buiten je gewone bereik) mogen de as niet oprekken: begrens op het 2e-98e percentiel.
  const sorted = [...values].sort((x, y) => x - y);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const lo = Math.min(at(0.02), ...(band ?? [])); const hi = Math.max(at(0.98), ...(band ?? [])); const pad = (hi - lo) * 0.12 || 1;
  return <section className="p-detail" aria-label={`Uitleg en grafiek voor ${trend.label}`}>
    <div className="p-detail-head"><div><span className="p-overline">UITLEG · {trend.label.toUpperCase()}</span><h3>{text.headline}</h3></div><button type="button" onClick={onClose} className="p-detail-close" aria-label="Sluit uitleg">Sluiten ✕</button></div>
    <div className="p-detail-grid">
      <div>
        {data.length < 3 ? <p className="p-empty">Te weinig metingen in deze periode voor een grafiek.</p> : <>
          <div className="p-detail-controls"><label className="p-check"><input type="checkbox" checked={showAvg} onChange={(event) => setShowAvg(event.target.checked)} disabled={weekly} /> 7-daags gemiddelde</label>{weekly && <span>Bij lange perioden zie je het weekgemiddelde.</span>}</div>
          <div className="p-detail-plot"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 280 }}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" stroke="var(--gridline)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(value) => new Date(Number(value)).toLocaleDateString("nl-NL", weekly ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" })} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={36} />
              <YAxis domain={[lo - pad, hi + pad]} tickFormatter={(value) => fmtNum(Number(value), digits)} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={48} allowDataOverflow />
              {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="var(--series-chronic)" fillOpacity={0.14} ifOverflow="extendDomain" />}
              {days <= 365 && <ReferenceArea x1={Math.max(nowFrom, data[0].t)} x2={data.at(-1)!.t} fill={color} fillOpacity={0.08} ifOverflow="hidden" />}
              {trend.baseline != null && <ReferenceLine y={trend.baseline} stroke="var(--text-muted)" strokeDasharray="5 5" label={{ value: "basis", position: "insideTopLeft", fill: "var(--text-muted)", fontSize: 12 }} />}
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 }} labelFormatter={(value) => fmtDay(new Date(Number(value)).toISOString().slice(0, 10), true)} formatter={(value, name) => [`${fmtNum(Number(value), digits)} ${trend.unit}`, name === "avg" ? "7-daags gemiddelde" : weekly ? "Weekgemiddelde" : "Die dag"]} />
              <Line type="monotone" dataKey="value" name="value" stroke={color} strokeOpacity={showAvg && !weekly ? 0.45 : 1} strokeWidth={showAvg && !weekly ? 1.5 : 2.5} dot={!weekly && data.length <= 120 ? { r: 2.5, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 5 }} />
              {showAvg && !weekly && <Line type="monotone" dataKey="avg" name="avg" stroke={color} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />}
            </ComposedChart>
          </ResponsiveContainer></div>
          <p className="p-chart-legend"><span style={{ ["--c" as string]: color }}>{weekly ? "Weekgemiddelde" : "Dagwaarde"}</span>{showAvg && !weekly && <span className="strong" style={{ ["--c" as string]: color }}>7-daags gemiddelde</span>}<span className="band">Grijze zone: waar je dagwaarden normaal binnen blijven</span><span className="dash">Stippellijn: je basis</span></p>
        </>}
      </div>
      <div className="p-detail-text">
        <h4>Wat zie ik nu?</h4>
        <p>{text.body}</p>
        {text.conclusion && <p className="p-detail-verdict"><b>Conclusie:</b> {text.conclusion}</p>}
        {guide && <><h4>Wat is dit?</h4><p>{guide.what}</p><h4>Zo lees je het</h4><p>{guide.read}</p>{guide.tips.length > 0 && <><h4>Goed om te weten</h4><ul>{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></>}</>}
      </div>
    </div>
  </section>;
}

export function MetricExplorer({ today, groups }: { today: string; groups: ExplorerGroup[] }) {
  const [days, setDays] = useState(90);
  const [selected, setSelected] = useState<HealthKey | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const all = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = all.find((item) => item.trend.key === selected);
  useEffect(() => { if (selected) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selected]);
  const weekly = days >= WEEKLY_FROM;
  return <div className="p-explorer">
    <div className="p-explorer-bar">
      <details className="p-help"><summary>Zo lees je deze pagina</summary><dl>
        <dt>Nu</dt><dd>Het gemiddelde van je laatste 7 dagen met een meting. Eén dag zegt weinig; een week geeft een betrouwbaarder beeld.</dd>
        <dt>Basis</dt><dd>Jouw eigen gebruikelijke niveau: het gemiddelde van de 28 dagen vóór die laatste week. Je wordt dus alleen met jezelf vergeleken.</dd>
        <dt>Normale schommeling</dt><dd>Elke meting verschilt per dag. Pulse meet hoe sterk jouw waarde normaal schommelt en vergelijkt het verschil tussen nu en basis daarmee. Binnen die schommeling is het ruis, geen signaal.</dd>
        <dt>Het label</dt><dd><b>Normaal voor jou</b>: ruis. <b>Iets hoger/lager</b>: lichte afwijking, kijk of het aanhoudt. <b>Duidelijk hoger/lager</b>: groter dan je gebruikelijke schommeling. De kleur zegt of dat gunstig (groen) of ongunstig (rood, oranje) is voor een loper.</dd>
        <dt>De grafiek</dt><dd>De gekozen periode (kies hierboven). De stippellijn is je basis, de grijze zone is waar je dagwaarden normaal binnen blijven. Wijs of tik een punt aan voor de waarde van die dag. Klik op een kaart voor een grote grafiek en uitleg.</dd>
      </dl></details>
      <div className="p-periods" role="group" aria-label="Periode van de grafieken">{PERIODS.map((period) => <button key={period.days} type="button" aria-pressed={days === period.days} onClick={() => setDays(period.days)}>{period.label}</button>)}</div>
    </div>
    <div ref={panel}>{current && <Detail key={`${current.trend.key}-${days}`} trend={current.trend} color={current.color} digits={current.digits} today={today} days={days} onClose={() => setSelected(null)} />}</div>
    {groups.map((group) => <section className="p-section" key={group.title} aria-label={group.title}>
      <div className="p-section-head"><div><span className="p-overline">{group.overline}</span><h2>{group.title}</h2></div></div>
      {group.notice}
      <div className="p-tiles">{group.items.map(({ trend, color, digits }) => {
        const points = windowed(trend, today, days);
        const shown = weekly ? aggregateWeekly(points) : points;
        const missing = trend.current == null;
        const band: [number, number] | null = trend.baseline != null && trend.baselineSd != null ? [trend.baseline - trend.baselineSd, trend.baseline + trend.baselineSd] : null;
        const stale = trend.currentAgeDays != null && trend.currentAgeDays > 14;
        return <article className={`p-metric p-metric-live${selected === trend.key ? " is-selected" : ""}`} key={trend.key}>
          <div className="p-metric-top"><span className="p-metric-label">{trend.label}</span>{!missing && (stale ? <span className="p-badge">Verouderd</span> : <span className={`p-badge p-badge-${badgeTone(trend)}`}>{badgeLabel(trend)}</span>)}</div>
          <div className="p-metric-value">{missing ? <span className="p-metric-empty">Geen recente data</span> : <><strong>{fmtNum(trend.current, digits)}</strong><small>{trend.unit}</small></>}</div>
          {!missing && <p className="p-metric-meta">{trend.baseline != null ? <>Basis {fmtNum(trend.baseline, digits)} · <b>{fmtSigned(trend.deltaPct, 1, "%")}</b> <span className="p-muted">(laatste {trend.recentDays} dagen)</span></> : "Basislijn bouwt op"}</p>}
          {missing && <p className="p-metric-meta">{trend.currentAgeDays != null ? `Laatste meting ${trend.currentAgeDays} dagen geleden` : "Nog nooit ontvangen"}</p>}
          {!missing && <InteractiveSpark points={shown} color={color} baseline={trend.baseline} band={band} unit={trend.unit} digits={digits} weekly={weekly} />}
          {!missing && trend.currentAgeDays != null && trend.currentAgeDays >= 2 && <p className="p-metric-age">Laatst gemeten {trend.currentAgeDays} dagen geleden</p>}
          <button type="button" className="p-metric-more" aria-expanded={selected === trend.key} onClick={() => setSelected(selected === trend.key ? null : trend.key)}>{selected === trend.key ? "Verberg uitleg" : "Uitleg en grote grafiek"}</button>
        </article>;
      })}</div>
    </section>)}
  </div>;
}
