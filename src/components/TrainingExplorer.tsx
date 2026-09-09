"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrainingRun = {
  id: number; name: string; date: string; distanceM: number | null; movingTimeS: number | null;
  pace: number | null; avgHr: number | null; elevationM: number | null; cadence: number | null;
  sufferScore: number | null; workoutType: number | null;
};

type MetricKey = "km" | "pace" | "speed" | "time" | "hr" | "elevation" | "cadence" | "runs";
type GroupKey = "day" | "week" | "month" | "year";
type TypeKey = "all" | "easy" | "interval" | "race" | "long";
type DistanceKey = "all" | "short" | "five" | "ten" | "long";

const metrics: Record<MetricKey, { label: string; short: string; additive: boolean; color: string }> = {
  km: { label: "Afstand", short: "km", additive: true, color: "#ee6547" },
  pace: { label: "Tempo", short: "min/km", additive: false, color: "#7658d6" },
  speed: { label: "Snelheid", short: "km/u", additive: false, color: "#2581b9" },
  time: { label: "Looptijd", short: "uur", additive: true, color: "#238764" },
  hr: { label: "Hartslag", short: "bpm", additive: false, color: "#df4d57" },
  elevation: { label: "Hoogtemeters", short: "m", additive: true, color: "#a37435" },
  cadence: { label: "Cadans", short: "spm", additive: false, color: "#15918b" },
  runs: { label: "Aantal trainingen", short: "runs", additive: true, color: "#425d52" },
};

const pad = (value: number) => String(value).padStart(2, "0");
function paceText(value: number | null) { if (value == null || !Number.isFinite(value)) return "–"; let min = Math.floor(value); let sec = Math.round((value - min) * 60); if (sec === 60) { min++; sec = 0; } return `${min}:${pad(sec)}`; }
function runKind(run: TrainingRun): Exclude<TypeKey, "all"> {
  const name = run.name.toLowerCase();
  if (run.workoutType === 1 || /wedstrijd|race|marathon|\b10k\b|\b5k\b/.test(name)) return "race";
  if (run.workoutType === 2 || /lange|long run|duurloop lang/.test(name) || (run.distanceM ?? 0) >= 14000) return "long";
  if (run.workoutType === 3 || /interval|tempo|fartlek|threshold|drempel|repetition/.test(name)) return "interval";
  return "easy";
}
function distanceMatches(run: TrainingRun, filter: DistanceKey) { const km = (run.distanceM ?? 0) / 1000; if (filter === "short") return km < 5; if (filter === "five") return km >= 5 && km < 10; if (filter === "ten") return km >= 10 && km < 15; if (filter === "long") return km >= 15; return true; }
function bucketKey(date: Date, group: GroupKey) {
  if (group === "year") return String(date.getFullYear());
  if (group === "month") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  if (group === "week") { const monday = new Date(date); const day = monday.getDay() || 7; monday.setDate(monday.getDate() - day + 1); return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`; }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function bucketLabel(key: string, group: GroupKey) { if (group === "year") return key; const date = new Date(`${key}${group === "month" ? "-01" : ""}T12:00:00`); return date.toLocaleDateString("nl-NL", group === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }); }

function aggregateValue(runs: TrainingRun[], metric: MetricKey) {
  const distanceKm = runs.reduce((sum, run) => sum + (run.distanceM ?? 0) / 1000, 0);
  const timeS = runs.reduce((sum, run) => sum + (run.movingTimeS ?? 0), 0);
  if (metric === "km") return distanceKm;
  if (metric === "time") return timeS / 3600;
  if (metric === "runs") return runs.length;
  if (metric === "pace") return distanceKm > 0 ? timeS / 60 / distanceKm : null;
  if (metric === "speed") return timeS > 0 ? distanceKm / (timeS / 3600) : null;
  if (metric === "elevation") return runs.reduce((sum, run) => sum + (run.elevationM ?? 0), 0);
  const values = runs.flatMap((run) => metric === "hr" ? run.avgHr == null ? [] : [run.avgHr] : run.cadence == null ? [] : [run.cadence * 2]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function displayValue(metric: MetricKey, value: number | null) { if (value == null) return "–"; if (metric === "pace") return `${paceText(value)} /km`; if (metric === "km") return `${value.toFixed(1)} km`; if (metric === "speed") return `${value.toFixed(1)} km/u`; if (metric === "time") return `${value.toFixed(1)} uur`; if (metric === "hr") return `${Math.round(value)} bpm`; if (metric === "elevation") return `${Math.round(value)} m`; if (metric === "cadence") return `${Math.round(value)} spm`; return `${Math.round(value)} runs`; }

export function TrainingExplorer({ runs, referenceNow }: { runs: TrainingRun[]; referenceNow: string }) {
  const [period, setPeriod] = useState("365");
  const [type, setType] = useState<TypeKey>("all");
  const [distance, setDistance] = useState<DistanceKey>("all");
  const [group, setGroup] = useState<GroupKey>("month");
  const [chartMetric, setChartMetric] = useState<MetricKey>("km");
  const [shownStats, setShownStats] = useState<MetricKey[]>(["km", "pace", "hr", "time"]);

  const filtered = useMemo(() => runs.filter((run) => {
    const periodOk = period === "all" || new Date(run.date).getTime() >= new Date(referenceNow).getTime() - Number(period) * 86_400_000;
    return periodOk && (type === "all" || runKind(run) === type) && distanceMatches(run, distance);
  }), [runs, period, type, distance, referenceNow]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, TrainingRun[]>();
    for (const run of [...filtered].reverse()) { const key = bucketKey(new Date(run.date), group); buckets.set(key, [...(buckets.get(key) ?? []), run]); }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({ label: bucketLabel(key, group), value: aggregateValue(bucket, chartMetric), count: bucket.length }));
  }, [filtered, group, chartMetric]);

  const toggleStat = (key: MetricKey) => setShownStats((current) => current.includes(key) ? current.length === 1 ? current : current.filter((item) => item !== key) : [...current, key]);
  const trendValues = chartData.flatMap((item) => item.value == null ? [] : [item.value]);
  const trend = trendValues.length >= 2 ? trendValues.at(-1)! - trendValues[0] : null;
  const trendText = trend == null ? "Nog geen trend" : chartMetric === "pace" ? `${Math.abs(trend * 60).toFixed(0)} sec/km ${trend < 0 ? "sneller" : "langzamer"}` : `${trend >= 0 ? "+" : ""}${trend.toFixed(chartMetric === "km" || chartMetric === "time" || chartMetric === "speed" ? 1 : 0)} ${metrics[chartMetric].short}`;
  const Chart = metrics[chartMetric].additive ? BarChart : LineChart;

  return <>
    <section className="training-filter-panel">
      <div><span className="eyebrow">Analyse instellen</span><h2>Kies wat je wilt onderzoeken</h2></div>
      <div className="training-filter-grid">
        <label>Periode<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7">7 dagen</option><option value="28">4 weken</option><option value="90">3 maanden</option><option value="365">1 jaar</option><option value="730">2 jaar</option><option value="all">Alles</option></select></label>
        <label>Trainingstype<select value={type} onChange={(event) => setType(event.target.value as TypeKey)}><option value="all">Alle trainingen</option><option value="easy">Rustig / overig</option><option value="interval">Interval / tempo</option><option value="race">Wedstrijd</option><option value="long">Lange duurloop</option></select></label>
        <label>Afstand<select value={distance} onChange={(event) => setDistance(event.target.value as DistanceKey)}><option value="all">Alle afstanden</option><option value="short">Korter dan 5 km</option><option value="five">5–10 km</option><option value="ten">10–15 km</option><option value="long">15 km of langer</option></select></label>
        <label>Groeperen per<select value={group} onChange={(event) => setGroup(event.target.value as GroupKey)}><option value="day">Dag</option><option value="week">Week</option><option value="month">Maand</option><option value="year">Jaar</option></select></label>
      </div>
      <p className="filter-result"><strong>{filtered.length}</strong> van {runs.length} trainingen passen bij je selectie.</p>
    </section>

    <section className="stat-picker-panel">
      <div className="training-section-title"><div><span className="eyebrow">Jouw statistieken</span><h2>Zet zelf de cijfers aan die je nodig hebt</h2></div><div className="stat-toggles">{(Object.keys(metrics) as MetricKey[]).map((key) => <button type="button" aria-pressed={shownStats.includes(key)} onClick={() => toggleStat(key)} key={key}>{shownStats.includes(key) ? "✓ " : "+ "}{metrics[key].label}</button>)}</div></div>
      <div className="chosen-stat-grid">{shownStats.map((key) => <article key={key}><small>{metrics[key].label}</small><strong>{displayValue(key, aggregateValue(filtered, key))}</strong><span>{key === "pace" ? "gewogen naar afstand" : `binnen huidige selectie`}</span></article>)}</div>
    </section>

    <section className="training-chart-panel">
      <div className="training-section-title"><div><span className="eyebrow">Ontwikkeling</span><h2>{metrics[chartMetric].label} per {group === "day" ? "dag" : group === "week" ? "week" : group === "month" ? "maand" : "jaar"}</h2><p>{chartMetric === "pace" ? "Lager is sneller." : "Bekijk de verandering binnen je gekozen filters."} {trendText}.</p></div><label>Toon in grafiek<select value={chartMetric} onChange={(event) => setChartMetric(event.target.value as MetricKey)}>{(Object.keys(metrics) as MetricKey[]).map((key) => <option key={key} value={key}>{metrics[key].label}</option>)}</select></label></div>
      <div className="training-chart" aria-label={`${metrics[chartMetric].label} ontwikkeling`}>
        {chartData.length === 0 ? <p>Geen trainingen binnen deze selectie.</p> : <ResponsiveContainer width="100%" height="100%"><Chart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }} accessibilityLayer><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gridline)" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7a8982" }} tickLine={false} axisLine={false} /><YAxis reversed={chartMetric === "pace"} tickFormatter={(value) => chartMetric === "pace" ? paceText(Number(value)) : String(Math.round(Number(value)))} tick={{ fontSize: 10, fill: "#7a8982" }} tickLine={false} axisLine={false} width={48} /><Tooltip formatter={(value) => [displayValue(chartMetric, Number(value)), metrics[chartMetric].label]} contentStyle={{ border: "1px solid rgba(18,37,31,.1)", borderRadius: 12, fontSize: 11 }} />{metrics[chartMetric].additive ? <Bar dataKey="value" fill={metrics[chartMetric].color} radius={[6, 6, 0, 0]} /> : <Line type="monotone" dataKey="value" stroke={metrics[chartMetric].color} strokeWidth={3} dot={{ r: 3, fill: metrics[chartMetric].color, strokeWidth: 0 }} connectNulls />}</Chart></ResponsiveContainer>}
      </div>
    </section>

    <section className="filtered-runs-panel"><div className="training-section-title"><div><span className="eyebrow">Onderliggende trainingen</span><h2>Vergelijk de runs in je selectie</h2></div></div><div className="filtered-run-list">{filtered.slice(0, 100).map((run) => <Link href={`/runs/${run.id}`} key={run.id}><span className={`run-kind ${runKind(run)}`}>{runKind(run) === "interval" ? "Interval" : runKind(run) === "race" ? "Wedstrijd" : runKind(run) === "long" ? "Lange duur" : "Rustig"}</span><div><strong>{run.name}</strong><small>{new Date(run.date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</small></div><b>{((run.distanceM ?? 0) / 1000).toFixed(1)} km</b><b>{paceText(run.pace)} /km</b><b>{run.avgHr ? `${Math.round(run.avgHr)} bpm` : "–"}</b><i>→</i></Link>)}</div></section>
  </>;
}
