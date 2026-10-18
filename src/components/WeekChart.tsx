"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDay, fmtNum } from "@/lib/format";
import type { WeekPoint } from "@/lib/training-health";

type Overlay = "hrv" | "rhr";
const RANGES = [{ weeks: 8, label: "8 weken" }, { weeks: 13, label: "3 maanden" }, { weeks: 26, label: "6 maanden" }, { weeks: 52, label: "1 jaar" }, { weeks: 104, label: "2 jaar" }];

export function WeekChart({ weeks }: { weeks: WeekPoint[] }) {
  const [range, setRange] = useState(26);
  const [overlay, setOverlay] = useState<Overlay>("hrv");
  const longRange = range > 26;
  const data = weeks.slice(-range).map((week) => ({ ...week, label: longRange ? new Date(`${week.weekStart}T12:00:00Z`).toLocaleDateString("nl-NL", { month: "short", year: "2-digit", timeZone: "UTC" }) : fmtDay(week.weekStart), overlay: overlay === "hrv" ? week.hrv : week.rhr }));
  const color = overlay === "hrv" ? "var(--series-hrv)" : "var(--series-rhr)";
  const overlayCount = data.filter((week) => week.overlay != null).length;
  return <div className="p-chart">
    <div className="p-chart-controls">
      <div role="group" aria-label="Periode">{RANGES.filter((item) => item.weeks <= weeks.length).map((item) => <button key={item.weeks} type="button" aria-pressed={range === item.weeks} onClick={() => setRange(item.weeks)}>{item.label}</button>)}</div>
      <div role="group" aria-label="Health-lijn"><button type="button" aria-pressed={overlay === "hrv"} onClick={() => setOverlay("hrv")}>HRV</button><button type="button" aria-pressed={overlay === "rhr"} onClick={() => setOverlay("rhr")}>Rusthartslag</button></div>
    </div>
    <div className="p-chart-plot">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 280 }}>
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 4" stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={longRange ? 36 : 18} />
          <YAxis yAxisId="km" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={52} unit=" km" />
          <YAxis yAxisId="health" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 12, fill: color }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14 }} labelFormatter={(_, payload) => payload[0]?.payload ? `Week van ${fmtDay(payload[0].payload.weekStart, true)}` : ""} formatter={(value, name) => name === "km" ? [`${fmtNum(Number(value), 1)} km`, "Hardlopen"] : [`${fmtNum(Number(value))} ${overlay === "hrv" ? "ms" : "bpm"}`, overlay === "hrv" ? "HRV (weekgemiddelde)" : "Rusthartslag (weekgemiddelde)"]} />
          <Bar yAxisId="km" dataKey="km" name="km" fill="var(--series-run)" radius={[5, 5, 0, 0]} maxBarSize={range > 52 ? 10 : range > 26 ? 18 : 34} />
          <Line yAxisId="health" type="monotone" dataKey="overlay" name="overlay" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color, strokeWidth: 0 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <p className="p-chart-legend"><span className="run">Kilometers per week</span><span className={overlay}>{overlay === "hrv" ? "HRV" : "Rusthartslag"} (weekgemiddelde){overlayCount < 3 ? " · te weinig weken met data" : ""}</span></p>
  </div>;
}
