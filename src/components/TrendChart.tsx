"use client";

import type { ReactNode } from "react";
import { buildChartTicks, chartSpanDays, formatChartTick, summarizeChartPoints } from "@/lib/chart-range";

import {
  CartesianGrid,
  Line,
  LineChart,
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
  color,
  unit,
  reversed = false,
  controls,
  dateDomain,
}: {
  title: string;
  subtitle?: string;
  points: Point[];
  color: string;
  unit: Unit;
  reversed?: boolean;
  controls?: ReactNode;
  dateDomain?: [string, string];
}) {
  const formatter = FORMATTERS[unit];
  const data = points
    .filter((point) => point.value != null)
    .map((point) => ({ ...point, timestamp: dateTimestamp(point.date) }));
  const values = data.map((point) => point.value).filter((value): value is number => value != null);
  const summary = summarizeChartPoints(points);
  const average = values.length >= 3 ? summary.average : null;
  const latest = summary.latest;
  const first = summary.first;
  const resolvedDateDomain: [string, string] = dateDomain ?? [data[0]?.date ?? "1970-01-01", data.at(-1)?.date ?? "1970-01-02"];
  const spanDays = chartSpanDays(resolvedDateDomain);
  const xTicks = buildChartTicks(resolvedDateDomain);

  let domain: [number, number] | undefined;
  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
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
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
        {latest != null && values.length >= 3 && (
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatter.value(latest)}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 8 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" stroke="var(--gridline)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={dateDomain ? dateDomain.map(dateTimestamp) : ["dataMin", "dataMax"]}
                ticks={xTicks}
                allowDataOverflow
                minTickGap={34}
                tickFormatter={(value) => formatChartTick(Number(value), spanDays)}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--axis)" }}
                tickLine={false}
              />
              <YAxis
                domain={domain}
                reversed={reversed}
                tickFormatter={formatter.tick}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                width={54}
                axisLine={false}
                tickLine={false}
                label={{ value: formatter.axis, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 10 }}
              />
              {average != null && (
                <ReferenceLine y={average} stroke="var(--text-muted)" strokeDasharray="5 5" label={{ value: "gem.", position: "insideTopRight", fill: "var(--text-muted)", fontSize: 10 }} />
              )}
              <Tooltip
                contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-secondary)", marginBottom: 4 }}
                labelFormatter={(_, payload) => payload[0]?.payload?.date ? fmtDateLong(payload[0].payload.date) : ""}
                formatter={(value) => [formatter.value(Number(value)), title]}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: "var(--surface-1)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
