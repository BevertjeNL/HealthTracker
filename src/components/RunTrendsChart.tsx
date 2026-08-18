"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type Point = {
  date: string;
  paceMinPerKm: number | null;
  avgHeartRate: number | null;
};

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function fmtPaceTick(v: number) {
  const min = Math.floor(v);
  const sec = Math.round((v - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function RunTrendsChart({ points }: { points: Point[] }) {
  const data = [...points].reverse().map((p) => ({
    ...p,
    dateLabel: fmtDateShort(p.date),
  }));

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="h-64 rounded-xl p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Tempo per run
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              domain={["dataMin - 0.3", "dataMax + 0.3"]}
              reversed
              tickFormatter={fmtPaceTick}
              width={45}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--text-secondary)" }}
              formatter={(value) => [fmtPaceTick(Number(value)) + " /km", "Tempo"]}
              labelFormatter={(label) => label}
            />
            <Line
              type="monotone"
              dataKey="paceMinPerKm"
              stroke="var(--series-orange)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-orange)", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="h-64 rounded-xl p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Gemiddelde hartslag per run
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} domain={["dataMin - 5", "dataMax + 5"]} width={35} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--text-secondary)" }}
              formatter={(value) => [Math.round(Number(value)) + " bpm", "Gem. HR"]}
            />
            <Line
              type="monotone"
              dataKey="avgHeartRate"
              stroke="var(--series-red)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-red)", stroke: "var(--surface-1)", strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
