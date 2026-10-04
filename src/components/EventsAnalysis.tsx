"use client";

import { useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPaceSec, formatTime, PATTERN_LABEL, type Advice, type PacingPattern } from "@/lib/run-analysis";

export type EventView = { id: number; name: string; date: string; distanceKm: number; timeS: number; paceSec: number | null; avgHr: number | null; isPr: boolean; deltaPrevSec: number | null; prepWeeklyKm: number | null; prepLongestKm: number | null; taperPct: number | null; pattern: PacingPattern | null; fadeSec: number | null };
export type EventGroupView = { key: string; label: string; events: EventView[]; advice: Advice[] };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export function EventsAnalysis({ groups }: { groups: EventGroupView[] }) {
  const [active, setActive] = useState(groups[0]?.key ?? "");
  const group = groups.find((item) => item.key === active) ?? groups[0];
  if (!group) return null;
  const comparable = group.key !== "other";
  const chartData = [...group.events].reverse().flatMap((event) => (event.paceSec == null ? [] : [{ label: fmtDate(event.date), pace: Math.round(event.paceSec) }]));

  return <div className="an-events">
    <div className="an-toggle" role="tablist" aria-label="Afstand">{groups.map((item) => <button type="button" role="tab" aria-selected={item.key === group.key} key={item.key} onClick={() => setActive(item.key)}>{item.label} · {item.events.length}</button>)}</div>
    <div className="an-advice-list">{group.advice.map((item) => <article className={`an-advice ${item.tone}`} key={item.title}><b>{item.title}</b><p>{item.detail}</p></article>)}</div>
    {comparable && chartData.length >= 3 && <div className="an-chart" role="img" aria-label={`Wedstrijdtempo ${group.label} over tijd`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gridline)" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} /><YAxis reversed domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={(value) => formatPaceSec(Number(value))} tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} width={42} /><Tooltip formatter={(value) => [`${formatPaceSec(Number(value))} /km`, "Tempo"]} /><Line type="monotone" dataKey="pace" stroke="#ef6545" strokeWidth={2.5} dot={{ r: 4, fill: "#ef6545" }} /></LineChart></ResponsiveContainer></div>}
    <div className="an-table-wrap"><table className="an-table"><thead><tr><th>Wedstrijd</th><th>Tijd</th><th>Tempo</th>{comparable && <th>Δ vorige</th>}<th>Hartslag</th><th>Verloop</th><th>Km/week ervoor</th><th>Langste loop</th><th>Laatste week</th></tr></thead><tbody>{group.events.map((event) => <tr key={event.id}><td><Link href={`/runs/${event.id}`}><b>{event.name}</b></Link> {event.isPr && <span className="an-pr">PR</span>}<br /><small>{fmtDate(event.date)}{group.key === "other" ? ` · ${event.distanceKm.toFixed(1)} km` : ""}</small></td><td>{formatTime(event.timeS)}</td><td>{formatPaceSec(event.paceSec)}</td>{comparable && <td className={event.deltaPrevSec == null ? "" : event.deltaPrevSec < 0 ? "fast" : "slow"}>{event.deltaPrevSec == null ? "–" : `${event.deltaPrevSec > 0 ? "+" : ""}${Math.round(event.deltaPrevSec)} s`}</td>}<td>{event.avgHr ? Math.round(event.avgHr) : "–"}</td><td>{event.pattern ? `${PATTERN_LABEL[event.pattern]}${event.fadeSec != null ? ` (${event.fadeSec > 0 ? "+" : ""}${event.fadeSec} s)` : ""}` : "Geen splits"}</td><td>{event.prepWeeklyKm != null ? `${Math.round(event.prepWeeklyKm)} km` : "–"}</td><td>{event.prepLongestKm != null ? `${Math.round(event.prepLongestKm)} km` : "–"}</td><td>{event.taperPct != null ? `${event.taperPct}%` : "–"}</td></tr>)}</tbody></table></div>
    <p className="an-hint">Voorbereiding = de 6 weken voor de wedstrijd, zonder andere wedstrijden. Laatste week = je kilometers in de 7 dagen ervoor als percentage van je weekgemiddelde.</p>
  </div>;
}
