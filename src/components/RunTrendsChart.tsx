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
      <div className="h-64 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Tempo per run
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={["dataMin - 0.3", "dataMax + 0.3"]}
              reversed
              tickFormatter={fmtPaceTick}
              width={45}
            />
            <Tooltip
              formatter={(value) => [fmtPaceTick(Number(value)) + " /km", "Tempo"]}
              labelFormatter={(label) => label}
            />
            <Line
              type="monotone"
              dataKey="paceMinPerKm"
              stroke="#FC5200"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="h-64 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Gemiddelde hartslag per run
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={["dataMin - 5", "dataMax + 5"]} width={35} />
            <Tooltip formatter={(value) => [Math.round(Number(value)) + " bpm", "Gem. HR"]} />
            <Line
              type="monotone"
              dataKey="avgHeartRate"
              stroke="#e11d48"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
