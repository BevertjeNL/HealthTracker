"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

type Point = { date: string; value: number | null };

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function TrendChart({
  title,
  points,
  color,
  formatValue,
  formatTick,
  reversed = false,
}: {
  title: string;
  points: Point[];
  color: string;
  formatValue: (v: number) => string;
  formatTick?: (v: number) => string;
  reversed?: boolean;
}) {
  const data = points.map((p) => ({ ...p, dateLabel: fmtDateShort(p.date) }));
  const tickFmt = formatTick ?? ((v: number) => String(Math.round(v)));

  return (
    <div
      className="h-64 rounded-xl p-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {title}
      </p>
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
            domain={["dataMin", "dataMax"]}
            reversed={reversed}
            tickFormatter={tickFmt}
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
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
