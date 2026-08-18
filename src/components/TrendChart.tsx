"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

type Point = { date: string; value: number | null };

type Unit = "kg" | "pace" | "number";

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function fmtPaceTick(v: number) {
  const min = Math.floor(v);
  const sec = Math.round((v - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// formatValue/formatTick can't be passed as props from a Server Component (functions
// aren't serializable across the RSC boundary), so the unit picks the formatter here instead.
const FORMATTERS: Record<Unit, { value: (v: number) => string; tick: (v: number) => string }> = {
  kg: { value: (v) => `${v.toFixed(1)} kg`, tick: (v) => v.toFixed(0) },
  pace: { value: (v) => `${fmtPaceTick(v)} /km`, tick: fmtPaceTick },
  number: { value: (v) => v.toFixed(1), tick: (v) => String(Math.round(v)) },
};

export function TrendChart({
  title,
  points,
  color,
  unit,
  reversed = false,
}: {
  title: string;
  points: Point[];
  color: string;
  unit: Unit;
  reversed?: boolean;
}) {
  const { value: formatValue, tick: formatTick } = FORMATTERS[unit];

  // Trim leading/trailing stretches with no value at all, so a metric that only
  // started being logged partway through the window doesn't stretch a flat,
  // empty line across the whole chart.
  const firstIdx = points.findIndex((p) => p.value != null);
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p.value != null);
  const trimmed = firstIdx === -1 ? [] : points.slice(firstIdx, lastIdx + 1);
  const data = trimmed.map((p) => ({ ...p, dateLabel: fmtDateShort(p.date) }));

  const values = trimmed.map((p) => p.value).filter((v): v is number => v != null);

  let domain: [number, number] | undefined;
  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Pad the domain so a single data point (or several identical ones) doesn't
    // collapse the axis to a zero-height range.
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
    domain = [min - pad, max + pad];
  }

  return (
    <div
      className="h-64 rounded-xl p-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {title}
      </p>
      {values.length < 2 ? (
        <div className="flex h-[88%] items-center justify-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nog te weinig data voor een trend.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--axis)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              domain={domain}
              reversed={reversed}
              tickFormatter={formatTick}
              width={44}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--text-secondary)" }}
              formatter={(value) => [formatValue(Number(value)), title]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color, stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
