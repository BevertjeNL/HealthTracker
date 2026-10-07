"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPaceSec, KIND_LABEL, PATTERN_LABEL, type PacingAnalysis, type RunKind, type SimilarComparison } from "@/lib/run-analysis";

type Metric = "pace" | "gap" | "hr" | "watts" | "cadence" | "elevation";
const labels: Record<Metric, string> = { pace: "Tempo", gap: "Hoogtegecorrigeerd tempo", hr: "Hartslag", watts: "Vermogen", cadence: "Cadans", elevation: "Hoogteverschil" };
const units: Record<Metric, string> = { pace: "/km", gap: "/km", hr: "bpm", watts: "W", cadence: "stappen/min", elevation: "m" };
const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)} s`;
const valid = (value: string) => value.trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function RunCoach({ kind, km, laps, comparison }: { kind: RunKind; km: PacingAnalysis | null; laps: PacingAnalysis | null; comparison: SimilarComparison | null }) {
  const [unit, setUnit] = useState<"km" | "laps">(km ? "km" : "laps");
  const [metric, setMetric] = useState<Metric>("pace");
  const [xMin, setXMin] = useState("");
  const [xMax, setXMax] = useState("");
  const [yMin, setYMin] = useState("");
  const [yMax, setYMax] = useState("");
  const analysis = unit === "km" ? km : laps;
  if (!analysis) return null;
  const unitName = unit === "km" ? "kilometer" : "ronde";
  const data = analysis.rows.map((row, index) => ({ x: Number((analysis.rows.slice(0, index + 1).reduce((sum, item) => sum + item.distanceM, 0) / 1000).toFixed(2)), label: row.label, pace: row.paceSec, gap: row.gapPaceSec, hr: row.hr, watts: row.watts, cadence: row.cadenceSpm, elevation: row.elevM }));
  const distance = analysis.rows.reduce((sum, row) => sum + row.distanceM, 0) / 1000;
  const available = (Object.keys(labels) as Metric[]).filter((key) => data.some((point) => point[key] != null));
  const activeMetric = available.includes(metric) ? metric : "pace";
  const values = data.flatMap((point) => typeof point[activeMetric] === "number" ? [point[activeMetric] as number] : []);
  const naturalMin = Math.min(...values);
  const naturalMax = Math.max(...values);
  const padding = Math.max(1, (naturalMax - naturalMin) * .15);
  const defaultYMin = Math.max(activeMetric === "pace" || activeMetric === "gap" ? 0 : -Infinity, naturalMin - padding);
  const defaultYMax = naturalMax + padding;
  const xLo = valid(xMin) ?? 0;
  const xHi = valid(xMax) ?? Math.max(distance, 1);
  const yLo = valid(yMin) ?? defaultYMin;
  const yHi = valid(yMax) ?? defaultYMax;
  const rangeOk = xLo >= 0 && xHi <= distance + .01 && xLo < xHi && yLo < yHi;
  const format = (value: number) => activeMetric === "pace" || activeMetric === "gap" ? formatPaceSec(value) : Math.round(value).toLocaleString("nl-NL");
  const changeMetric = (next: Metric) => { setMetric(next); setYMin(""); setYMax(""); };
  const showHr = analysis.rows.some((row) => row.hr != null);
  const showCadence = analysis.rows.some((row) => row.cadenceSpm != null);
  const showPower = analysis.rows.some((row) => row.watts != null);
  const showGap = analysis.rows.some((row) => row.gapPaceSec != null);

  return <section className="an-coach" aria-labelledby="coach-title">
    <div className="an-coach-head"><div><span className="eyebrow">Loopstijl · {KIND_LABEL[kind]}</span><h2 id="coach-title">{PATTERN_LABEL[analysis.pattern]}</h2><p>{analysis.gradeAdjusted ? "Beoordeeld op inspanningstempo, gecorrigeerd voor hoogte." : `Beoordeeld op tempo per ${unitName}.`}</p></div>{km && laps && <div className="an-toggle" role="group" aria-label="Eenheid"><button type="button" aria-pressed={unit === "km"} onClick={() => setUnit("km")}>Per kilometer</button><button type="button" aria-pressed={unit === "laps"} onClick={() => setUnit("laps")}>Per ronde</button></div>}</div>
    <div className="an-stat-grid"><article><small>Eerste helft</small><strong>{formatPaceSec(analysis.firstHalfPaceSec)}</strong><span>/km</span></article><article><small>Tweede helft</small><strong>{formatPaceSec(analysis.secondHalfPaceSec)}</strong><span>{analysis.splitDiffSec <= -1 ? `${Math.abs(Math.round(analysis.splitDiffSec))} s sneller` : analysis.splitDiffSec >= 1 ? `${Math.round(analysis.splitDiffSec)} s langzamer` : "gelijk"}</span></article><article><small>Start</small><strong>{analysis.firstUnitDeltaSec == null ? "–" : signed(analysis.firstUnitDeltaSec)}</strong><span>eerste {unitName} vs. rest</span></article><article><small>Hartslagdrift</small><strong>{analysis.hrDriftPct == null ? "–" : `${analysis.hrDriftPct > 0 ? "+" : ""}${analysis.hrDriftPct.toFixed(1)}%`}</strong><span>{analysis.decouplingPct == null ? `geen hartslag per ${unitName}` : `efficiëntie ${analysis.decouplingPct > 0 ? "−" : "+"}${Math.abs(analysis.decouplingPct).toFixed(1)}%`}</span></article></div>
    {comparison && <p className="an-compare"><strong>Ten opzichte van {comparison.basis}:</strong> {comparison.paceDeltaSec != null && Math.abs(comparison.paceDeltaSec) >= 1 ? `${Math.abs(Math.round(comparison.paceDeltaSec))} s/km ${comparison.paceDeltaSec < 0 ? "sneller" : "langzamer"} dan de mediaan` : "gelijk aan de mediaan"}{comparison.hrDelta != null ? `, hartslag ${comparison.hrDelta > 0 ? "+" : ""}${Math.round(comparison.hrDelta)} bpm` : ""}. Positie {comparison.rank} van {comparison.count + 1}.</p>}
    <div className="an-advice-list">{analysis.advice.map((item) => <article className={`an-advice ${item.tone}`} key={item.title}><b>{item.title}</b><p>{item.detail}</p></article>)}</div>
    <div className="an-chart-panel"><div className="an-chart-heading"><div><span className="eyebrow">JE RUN IN BEELD</span><h3>{labels[activeMetric]} per afstand</h3></div><label>Meetwaarde<select value={activeMetric} onChange={(event) => changeMetric(event.target.value as Metric)}>{available.map((key) => <option key={key} value={key}>{labels[key]}</option>)}</select></label></div>
      <div className="an-axis-controls"><fieldset><legend>X-as · afstand (km)</legend><label>Van<input type="number" inputMode="decimal" step="0.1" min="0" max={distance} placeholder="0" value={xMin} onChange={(event) => setXMin(event.target.value)} /></label><label>Tot<input type="number" inputMode="decimal" step="0.1" min="0" max={distance} placeholder={distance.toFixed(1)} value={xMax} onChange={(event) => setXMax(event.target.value)} /></label></fieldset><fieldset><legend>Y-as · {labels[activeMetric]} ({activeMetric === "pace" || activeMetric === "gap" ? "sec/km" : units[activeMetric]})</legend><label>Van<input type="number" inputMode="decimal" step="any" placeholder={Math.round(defaultYMin).toString()} value={yMin} onChange={(event) => setYMin(event.target.value)} /></label><label>Tot<input type="number" inputMode="decimal" step="any" placeholder={Math.round(defaultYMax).toString()} value={yMax} onChange={(event) => setYMax(event.target.value)} /></label></fieldset><button type="button" onClick={() => { setXMin(""); setXMax(""); setYMin(""); setYMax(""); }}>Herstel bereik</button></div>
      {!rangeOk && <p className="an-range-error" role="alert">Kies voor beide assen een minimum dat kleiner is dan het maximum. De X-as loopt van 0 tot {distance.toFixed(1)} km.</p>}
      <div className="an-chart" role="img" aria-label={`${labels[activeMetric]} over afstand, met instelbare X- en Y-as`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 2 }} accessibilityLayer><defs><linearGradient id="runChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e78a5b" stopOpacity={.28} /><stop offset="100%" stopColor="#e78a5b" stopOpacity={.02} /></linearGradient></defs><CartesianGrid stroke="#e4ebe5" strokeDasharray="4 6" vertical={false} /><XAxis dataKey="x" type="number" domain={rangeOk ? [xLo, xHi] : [0, distance]} allowDataOverflow tick={{ fontSize: 13, fill: "#536d5c" }} tickLine={false} axisLine={false} unit=" km" /><YAxis reversed={activeMetric === "pace" || activeMetric === "gap"} domain={rangeOk ? [yLo, yHi] : [defaultYMin, defaultYMax]} allowDataOverflow tickFormatter={(value) => format(Number(value))} tick={{ fontSize: 13, fill: "#536d5c" }} tickLine={false} axisLine={false} width={58} /><Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #dce7db", fontSize: 14 }} labelFormatter={(label) => `${label} km`} formatter={(value) => [`${format(Number(value))} ${units[activeMetric]}`, labels[activeMetric]]} />{activeMetric === "pace" && <ReferenceLine y={analysis.avgPaceSec} stroke="#254b37" strokeDasharray="5 5" />}<Area type="monotone" dataKey={activeMetric} connectNulls={false} stroke="#dd714b" strokeWidth={3} fill="url(#runChartFill)" dot={{ r: 3, fill: "#dd714b", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} /></AreaChart></ResponsiveContainer></div>
    </div>
    <div className="an-table-wrap"><table className="an-table"><thead><tr><th>{unit === "km" ? "Km" : "Ronde"}</th><th>Tempo</th>{showGap && <th>Hoogtecorr.</th>}<th>Δ gem.</th>{showHr && <th>Hartslag</th>}<th>Hoogte</th>{showCadence && <th>Cadans</th>}{showPower && <th>Vermogen</th>}<th>Coach</th></tr></thead><tbody>{analysis.rows.map((row) => <tr key={row.label}><td>{row.label}{row.distanceM < 900 || unit === "laps" ? <small> · {(row.distanceM / 1000).toFixed(2)} km</small> : null}</td><td>{formatPaceSec(row.paceSec)}</td>{showGap && <td>{formatPaceSec(row.gapPaceSec)}</td>}<td className={row.deltaSec == null ? "" : row.deltaSec <= -3 ? "fast" : row.deltaSec >= 3 ? "slow" : ""}>{row.deltaSec == null ? "–" : signed(row.deltaSec)}</td>{showHr && <td>{row.hr ? Math.round(row.hr) : "–"}</td>}<td>{row.elevM ? `${row.elevM > 0 ? "+" : ""}${Math.round(row.elevM)} m` : "–"}</td>{showCadence && <td>{row.cadenceSpm ? Math.round(row.cadenceSpm) : "–"}</td>}{showPower && <td>{row.watts ? `${Math.round(row.watts)} W` : "–"}</td>}<td className={`an-note ${row.tone}`}>{row.note ?? ""}</td></tr>)}</tbody></table></div>
  </section>;
}
