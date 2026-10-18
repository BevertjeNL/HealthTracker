"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDay, fmtNum } from "@/lib/format";
import type { DayPoint } from "@/lib/training-health";

export function BalanceChart({ days }: { days: DayPoint[] }) {
  const data = days.slice(-90).filter((day) => day.acute != null).map((day) => ({ ...day, label: fmtDay(day.date), upper: day.chronic == null ? null : Math.round(day.chronic * 1.3), lower: day.chronic == null ? null : Math.round(day.chronic * 0.8) }));
  if (data.length < 14) return <p className="p-empty">Nog te weinig loopgeschiedenis voor een belastingtrend (28 dagen nodig).</p>;
  return <div className="p-chart"><div className="p-chart-plot p-chart-plot-short">
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 220 }}>
      <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 4" stroke="var(--gridline)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={34} />
        <YAxis tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 }} labelFormatter={(_, payload) => payload[0]?.payload ? fmtDay(payload[0].payload.date, true) : ""} formatter={(value, name) => [fmtNum(Number(value)), name === "acute" ? "Laatste 7 dagen" : name === "chronic" ? "Je normale week" : String(name)]} />
        <Area type="monotone" dataKey="upper" stroke="none" fill="var(--series-chronic)" fillOpacity={0.13} name="upper" legendType="none" activeDot={false} />
        <Area type="monotone" dataKey="lower" stroke="none" fill="var(--surface-1)" fillOpacity={1} name="lower" legendType="none" activeDot={false} />
        <Line type="monotone" dataKey="chronic" name="chronic" stroke="var(--series-chronic)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="acute" name="acute" stroke="var(--series-run)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  </div><p className="p-chart-legend"><span className="run">Laatste 7 dagen</span><span className="chronic">Je normale week · grijze zone is 80–130% daarvan</span></p></div>;
}
