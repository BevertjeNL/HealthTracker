"use client";

import type { ReactNode } from "react";
import { buildChartTicks, chartSpanDays, formatChartTick, summarizeChartPoints } from "@/lib/chart-range";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; value: number | null };
type Unit = "kg" | "pace" | "bpm" | "ms" | "hours" | "number";

function fmtDateLong(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function dateTimestamp(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
}

function fmtPace(v: number) {
  const sign = v < 0 ? "−" : "";
  const absolute = Math.abs(v);
  let min = Math.floor(absolute);
  let sec = Math.round((absolute - min) * 60);
  if (sec === 60) {
    min += 1;
    sec = 0;
  }
  return `${sign}${min}:${sec.toString().padStart(2, "0")}`;
}

const FORMATTERS: Record<Unit, { value: (v: number) => string; tick: (v: number) => string; axis: string }> = {
  kg: { value: (v) => `${v.toFixed(1)} kg`, tick: (v) => v.toFixed(1), axis: "kg" },
  pace: { value: (v) => `${fmtPace(v)} min/km`, tick: fmtPace, axis: "min/km" },
  bpm: { value: (v) => `${Math.round(v)} bpm`, tick: (v) => String(Math.round(v)), axis: "bpm" },
  ms: { value: (v) => `${Math.round(v)} ms`, tick: (v) => String(Math.round(v)), axis: "ms" },
  hours: { value: (v) => `${v.toFixed(1)} uur`, tick: (v) => v.toFixed(1), axis: "uur" },
  number: { value: (v) => v.toFixed(1), tick: (v) => String(Math.round(v)), axis: "waarde" },
};

export function TrendChart({
  title,
  subtitle,
  points,
  displayPoints,
  displayLabel,
  color,
  unit,
  reversed = false,
  controls,
  dateDomain,
  valueDomain,
  chartAside,
  chartFooter,
}: {
  title: string;
  subtitle?: string;
  points: Point[];
  displayPoints?: Point[];
  displayLabel?: string;
  color: string;
  unit: Unit;
  reversed?: boolean;
  controls?: ReactNode;
  dateDomain?: [string, string];
  valueDomain?: [number, number];
  chartAside?: ReactNode;
  chartFooter?: ReactNode;
}) {
  const formatter = FORMATTERS[unit];
  const data = (displayPoints ?? points)
    .filter((point) => point.value != null)
    .map((point) => ({ ...point, timestamp: dateTimestamp(point.date) }));
  const values = points.map((point) => point.value).filter((value): value is number => value != null);
  const displayValues = data.map((point) => point.value).filter((value): value is number => value != null);
  const summary = summarizeChartPoints(points);
  const average = values.length >= 3 ? summary.average : null;
  const latest = summary.latest;
  const first = summary.first;
  const resolvedDateDomain: [string, string] = dateDomain ?? [data[0]?.date ?? "1970-01-01", data.at(-1)?.date ?? "1970-01-02"];
  const spanDays = chartSpanDays(resolvedDateDomain);
  const xTicks = buildChartTicks(resolvedDateDomain);
  const dotRadius = displayPoints || data.length > 400 ? 0 : data.length > 120 ? 2 : 3.5;

  let domain: [number, number] | undefined;
  if (displayValues.length > 0) {
    const min = Math.min(...displayValues);
    const max = Math.max(...displayValues);
    const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;
    domain = [min - pad, max + pad];
  }

  return (
    <article
      className="min-h-80 rounded-2xl p-4 sm:p-5"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
      aria-label={`${title} trendgrafiek`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
        </div>
        {latest != null && values.length >= 3 && (
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatter.value(latest)}</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              laatste · bereik {first != null ? `${latest - first > 0 ? "+" : ""}${formatter.value(latest - first)}` : ""}
            </p>
          </div>
        )}
      </div>
      {controls}
      {values.length >= 3 && (
        <div className="chart-stat-strip" aria-label={`Samenvatting van ${title} binnen het gekozen bereik`}>
          <span><small>Gemiddeld</small><strong>{formatter.value(summary.average!)}</strong></span>
          <span><small>{reversed ? "Snelste" : "Laagste"}</small><strong>{formatter.value(summary.minimum!)}</strong></span>
          <span><small>{reversed ? "Langzaamste" : "Hoogste"}</small><strong>{formatter.value(summary.maximum!)}</strong></span>
        </div>
      )}
      {values.length < 3 ? (
        <div className="flex h-56 items-center justify-center rounded-xl" style={{ background: "var(--surface-2)" }}>
          <p className="max-w-56 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Nog te weinig data voor een betrouwbare trend ({values.length}/3 metingen).
          </p>
        </div>
      ) : (
        <div className="chart-frame">
        <div className="chart-plot h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={dateDomain ? dateDomain.map(dateTimestamp) : ["dataMin", "dataMax"]}
                ticks={xTicks}
                allowDataOverflow
                minTickGap={34}
                height={30}
                tickFormatter={(value) => formatChartTick(Number(value), spanDays)}
                tick={{ fontSize: 13, fill: "var(--text-secondary)" }}
                axisLine={{ stroke: "var(--axis)" }}
                tickLine={false}
              />
              <YAxis
                domain={valueDomain ?? domain}
                reversed={reversed}
                tickFormatter={formatter.tick}
                tick={{ fontSize: 13, fill: "var(--text-secondary)" }}
                width={58}
                axisLine={false}
                tickLine={false}
                allowDataOverflow={Boolean(valueDomain)}
                label={{ value: formatter.axis, angle: -90, position: "insideLeft", fill: "var(--text-secondary)", fontSize: 13 }}
              />
              {average != null && (
                <ReferenceLine y={average} stroke="var(--text-muted)" strokeDasharray="5 5" label={{ value: "gem.", position: "insideTopRight", fill: "var(--text-muted)", fontSize: 13 }} />
              )}
              <Tooltip
                contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 }}
                labelStyle={{ color: "var(--text-secondary)", marginBottom: 4 }}
                labelFormatter={(_, payload) => payload[0]?.payload?.date ? fmtDateLong(payload[0].payload.date) : ""}
                formatter={(value) => [formatter.value(Number(value)), displayLabel ?? title]}
              />
              {unit === "kg" ? <>
                <defs><linearGradient id="weight-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.23} /><stop offset="100%" stopColor={color} stopOpacity={0.01} /></linearGradient></defs>
                <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fill="url(#weight-chart-fill)" dot={dotRadius ? { r: dotRadius, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
              </> : <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={dotRadius ? { r: Math.min(dotRadius, 3), fill: color, strokeWidth: 0 } : false} activeDot={{ r: 5, stroke: "var(--surface-1)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {chartAside && <div className="chart-aside">{chartAside}</div>}
        {chartFooter && <div className="chart-footer">{chartFooter}</div>}
        </div>
      )}
      {values.length < 3 && chartFooter}
    </article>
  );
}
