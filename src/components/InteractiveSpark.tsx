"use client";

import { useRef, useState } from "react";
import { fmtDay, fmtNum } from "@/lib/format";

export type SparkPoint = { date: string; value: number };

// Gemiddelde per week voor lange perioden: dagwaarden worden dan een onleesbare streep.
export function aggregateWeekly(points: SparkPoint[]): SparkPoint[] {
  const weeks = new Map<string, number[]>();
  for (const point of points) {
    const day = new Date(`${point.date}T12:00:00Z`);
    const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    weeks.set(monday, [...(weeks.get(monday) ?? []), point.value]);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, value: values.reduce((sum, value) => sum + value, 0) / values.length }));
}

// Kleine grafiek met aanwijsbare punten. Op een telefoon werkt aanraken en slepen hetzelfde.
export function InteractiveSpark({ points, color, baseline, band, unit, digits, weekly }: { points: SparkPoint[]; color: string; baseline: number | null; band: [number, number] | null; unit: string; digits: number; weekly: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 3) return <div className="p-spark p-spark-empty">te weinig metingen in deze periode</div>;
  const width = 200; const height = 56;
  const values = points.map((point) => point.value);
  const extra = [...(baseline != null ? [baseline] : []), ...(band ?? [])];
  const min = Math.min(...values, ...extra); const max = Math.max(...values, ...extra);
  const span = max - min || 1;
  const t0 = new Date(points[0].date).getTime(); const t1 = new Date(points.at(-1)!.date).getTime();
  const x = (date: string) => t1 === t0 ? width / 2 : ((new Date(date).getTime() - t0) / (t1 - t0)) * (width - 8) + 4;
  const y = (value: number) => height - 5 - ((value - min) / span) * (height - 12);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.at(-1)!.date).toFixed(1)} ${height} L${x(points[0].date).toFixed(1)} ${height} Z`;
  const move = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const target = ((clientX - rect.left) / rect.width) * width;
    let best = 0; let distance = Infinity;
    points.forEach((point, index) => { const d = Math.abs(x(point.date) - target); if (d < distance) { distance = d; best = index; } });
    setActive(best);
  };
  const shown = active != null ? points[active] : points.at(-1)!;
  return <div className="p-ispark" ref={ref} onPointerMove={(event) => move(event.clientX)} onPointerDown={(event) => move(event.clientX)} onPointerLeave={() => setActive(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Verloop over ${points.length} ${weekly ? "weken" : "dagen"}`}>
      {band && <rect x="0" width={width} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill="currentColor" fillOpacity=".09" />}
      {baseline != null && <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)} stroke="currentColor" strokeOpacity=".35" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={area} fill={color} fillOpacity=".12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {active != null && <line x1={x(shown.date)} x2={x(shown.date)} y1="0" y2={height} stroke={color} strokeOpacity=".5" vectorEffect="non-scaling-stroke" />}
      <circle cx={x(shown.date)} cy={y(shown.value)} r="3.2" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
    <p className="p-ispark-read" aria-live="polite">{weekly ? "Week van " : ""}{fmtDay(shown.date, true)} · <b>{fmtNum(shown.value, digits)} {unit}</b>{weekly ? " (gem.)" : ""}</p>
  </div>;
}
