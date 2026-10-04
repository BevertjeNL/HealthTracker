"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPaceSec, KIND_LABEL, PATTERN_LABEL, type PacingAnalysis, type RunKind, type SimilarComparison } from "@/lib/run-analysis";

const TONE_COLOR = { good: "#238764", watch: "#e9a23b", action: "#e0523f", info: "#a9bbb2" } as const;
const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)} s`;

export function RunCoach({ kind, km, laps, comparison }: { kind: RunKind; km: PacingAnalysis | null; laps: PacingAnalysis | null; comparison: SimilarComparison | null }) {
  const [unit, setUnit] = useState<"km" | "laps">(km ? "km" : "laps");
  const analysis = unit === "km" ? km : laps;
  if (!analysis) return null;
  const unitName = unit === "km" ? "kilometer" : "ronde";
  const chartData = analysis.rows.map((row) => ({ label: row.label, pace: Math.round(row.paceSec), tone: row.tone }));
  const showHr = analysis.rows.some((row) => row.hr != null);
  const showCadence = analysis.rows.some((row) => row.cadenceSpm != null);

  return <section className="an-coach" aria-labelledby="coach-title">
    <div className="an-coach-head">
      <div><span className="eyebrow">Loopstijl · {KIND_LABEL[kind]}</span><h2 id="coach-title">{PATTERN_LABEL[analysis.pattern]}</h2><p>{analysis.gradeAdjusted ? "Beoordeeld op inspanningstempo (gecorrigeerd voor hoogte)." : "Beoordeeld op het werkelijke tempo per " + unitName + "."}</p></div>
      {km && laps && <div className="an-toggle" role="group" aria-label="Eenheid"><button type="button" aria-pressed={unit === "km"} onClick={() => setUnit("km")}>Per kilometer</button><button type="button" aria-pressed={unit === "laps"} onClick={() => setUnit("laps")}>Per ronde</button></div>}
    </div>
    <div className="an-stat-grid">
      <article><small>Eerste helft</small><strong>{formatPaceSec(analysis.firstHalfPaceSec)}</strong><span>/km</span></article>
      <article><small>Tweede helft</small><strong>{formatPaceSec(analysis.secondHalfPaceSec)}</strong><span>{analysis.splitDiffSec <= -1 ? `${Math.abs(Math.round(analysis.splitDiffSec))} s sneller` : analysis.splitDiffSec >= 1 ? `${Math.round(analysis.splitDiffSec)} s langzamer` : "gelijk"}</span></article>
      <article><small>Start</small><strong>{analysis.firstUnitDeltaSec == null ? "–" : signed(analysis.firstUnitDeltaSec)}</strong><span>eerste {unitName} vs. rest</span></article>
      <article><small>Hartslag-drift</small><strong>{analysis.hrDriftPct == null ? "–" : `${analysis.hrDriftPct > 0 ? "+" : ""}${analysis.hrDriftPct.toFixed(1)}%`}</strong><span>{analysis.decouplingPct == null ? "geen hartslag per " + unitName : `efficiëntie ${analysis.decouplingPct > 0 ? "−" : "+"}${Math.abs(analysis.decouplingPct).toFixed(1)}%`}</span></article>
    </div>
    {comparison && <p className="an-compare"><strong>Ten opzichte van {comparison.basis}:</strong> {comparison.paceDeltaSec != null && Math.abs(comparison.paceDeltaSec) >= 1 ? `${Math.abs(Math.round(comparison.paceDeltaSec))} s/km ${comparison.paceDeltaSec < 0 ? "sneller" : "langzamer"} dan de mediaan` : "gelijk aan de mediaan"}{comparison.hrDelta != null ? `, hartslag ${comparison.hrDelta > 0 ? "+" : ""}${Math.round(comparison.hrDelta)} bpm` : ""}. Positie {comparison.rank} van {comparison.count + 1}.</p>}
    <div className="an-advice-list">{analysis.advice.map((item) => <article className={`an-advice ${item.tone}`} key={item.title}><b>{item.title}</b><p>{item.detail}</p></article>)}</div>
    <div className="an-chart" role="img" aria-label={`Tempo per ${unitName}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gridline)" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} /><YAxis reversed domain={["dataMin - 15", "dataMax + 10"]} tickFormatter={(value) => formatPaceSec(Number(value))} tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} width={42} /><Tooltip formatter={(value) => [`${formatPaceSec(Number(value))} /km`, "Tempo"]} labelFormatter={(label) => `${unitName[0].toUpperCase()}${unitName.slice(1)} ${label}`} /><ReferenceLine y={Math.round(analysis.avgPaceSec)} stroke="#183f32" strokeDasharray="4 3" /><Bar dataKey="pace" radius={[5, 5, 0, 0]}>{chartData.map((entry, index) => <Cell key={index} fill={TONE_COLOR[entry.tone]} />)}</Bar></BarChart></ResponsiveContainer></div>
    <div className="an-table-wrap"><table className="an-table"><thead><tr><th>{unit === "km" ? "Km" : "Ronde"}</th><th>Tempo</th><th>Δ gem.</th>{showHr && <th>Hartslag</th>}<th>Hoogte</th>{showCadence && <th>Cadans</th>}<th>Coach</th></tr></thead><tbody>{analysis.rows.map((row) => <tr key={row.label}><td>{row.label}{row.distanceM < 900 || unit === "laps" ? <small> · {(row.distanceM / 1000).toFixed(2)} km</small> : null}</td><td>{formatPaceSec(row.paceSec)}</td><td className={row.deltaSec == null ? "" : row.deltaSec <= -3 ? "fast" : row.deltaSec >= 3 ? "slow" : ""}>{row.deltaSec == null ? "–" : signed(row.deltaSec)}</td>{showHr && <td>{row.hr ? Math.round(row.hr) : "–"}</td>}<td>{row.elevM ? `${row.elevM > 0 ? "+" : ""}${Math.round(row.elevM)} m` : "–"}</td>{showCadence && <td>{row.cadenceSpm ? Math.round(row.cadenceSpm) : "–"}</td>}<td className={`an-note ${row.tone}`}>{row.note ?? ""}</td></tr>)}</tbody></table></div>
  </section>;
}
