"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RunSplit = { split: number; distance: number; movingTime: number; elevationDifference: number; averageSpeed: number; averageHeartRate: number | null };
const pad = (value: number) => String(value).padStart(2, "0");
function pace(speed: number | null) { if (!speed) return "–"; const value = 1000 / speed / 60; let min = Math.floor(value); let sec = Math.round((value - min) * 60); if (sec === 60) { min++; sec = 0; } return `${min}:${pad(sec)}`; }

export function SplitAnalyzer({ activityId, splits }: { activityId: number; splits: RunSplit[] }) {
  const router = useRouter();
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.max(1, splits.length));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => splits.filter((split) => split.split >= start && split.split <= end), [splits, start, end]);
  const distanceKm = selected.reduce((sum, split) => sum + split.distance, 0) / 1000;
  const timeS = selected.reduce((sum, split) => sum + split.movingTime, 0);
  const averageSpeed = timeS > 0 ? (distanceKm * 1000) / timeS : null;
  const heartRates = selected.flatMap((split) => split.averageHeartRate == null ? [] : [split.averageHeartRate]);
  const averageHr = heartRates.length ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null;
  const firstPace = selected[0]?.averageSpeed ? 1000 / selected[0].averageSpeed / 60 : null;
  const lastPace = selected.at(-1)?.averageSpeed ? 1000 / selected.at(-1)!.averageSpeed / 60 : null;
  const fade = firstPace != null && lastPace != null ? (lastPace - firstPace) * 60 : null;
  const chartData = selected.map((split) => ({ label: `${split.split}`, pace: split.averageSpeed ? 1000 / split.averageSpeed / 60 : null }));
  const setPreset = (from: number, to: number) => { setStart(Math.max(1, from)); setEnd(Math.min(splits.length, to)); };
  const loadSplits = async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/strava/activity/${activityId}`, { method: "POST" }); if (!response.ok) throw new Error(); router.refresh(); } catch { setError("De kilometergegevens konden niet worden opgehaald. Probeer opnieuw te synchroniseren."); } finally { setLoading(false); } };

  if (!splits.length) return <section className="split-empty"><div><span className="eyebrow">Deelanalyse</span><h2>Analyseer stukken van deze run</h2><p>Haal éénmalig de gedetailleerde kilometer-splits bij Strava op. Daarna kun je bijvoorbeeld de eerste en tweede helft of een zelfgekozen blok vergelijken.</p></div><button type="button" onClick={loadSplits} disabled={loading}>{loading ? "Splits ophalen…" : "Haal kilometer-splits op"}</button>{error && <p className="split-error">{error}</p>}</section>;

  return <section className="split-analyzer" aria-labelledby="split-title">
    <div className="split-heading"><div><span className="eyebrow">Deelanalyse</span><h2 id="split-title">Selecteer een stuk van je lange loop</h2><p>Kies hele kilometers. De samenvatting en grafiek rekenen alleen met het geselecteerde gedeelte.</p></div><div className="split-presets"><button type="button" onClick={() => setPreset(1, splits.length)}>Alles</button><button type="button" onClick={() => setPreset(1, Math.ceil(splits.length / 2))}>Eerste helft</button><button type="button" onClick={() => setPreset(Math.floor(splits.length / 2) + 1, splits.length)}>Tweede helft</button><button type="button" onClick={() => setPreset(Math.max(1, Math.floor(splits.length / 3)), Math.ceil(splits.length * 2 / 3))}>Middenstuk</button></div></div>
    <div className="split-controls"><label>Vanaf kilometer <input type="range" min="1" max={splits.length} value={start} onChange={(event) => setStart(Math.min(Number(event.target.value), end))} /><output>{start}</output></label><label>Tot en met kilometer <input type="range" min="1" max={splits.length} value={end} onChange={(event) => setEnd(Math.max(Number(event.target.value), start))} /><output>{end}</output></label></div>
    <div className="split-result-grid"><article><small>Geselecteerd</small><strong>km {start}–{end}</strong><span>{distanceKm.toFixed(1)} km totaal</span></article><article><small>Gemiddeld tempo</small><strong>{pace(averageSpeed)} /km</strong><span>{Math.round(timeS / 60)} minuten</span></article><article><small>Gem. hartslag</small><strong>{averageHr ? `${Math.round(averageHr)} bpm` : "–"}</strong><span>binnen dit blok</span></article><article><small>Tempoverloop</small><strong>{fade == null ? "–" : Math.abs(fade) < 5 ? "Stabiel" : fade > 0 ? `${Math.round(fade)} sec verval` : `${Math.abs(Math.round(fade))} sec sneller`}</strong><span>eerste versus laatste split</span></article></div>
    <div className="split-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} accessibilityLayer><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--gridline)" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} label={{ value: "kilometer", position: "insideBottomRight", offset: -2, fontSize: 9, fill: "#7b8983" }} /><YAxis reversed domain={["dataMin - 0.15", "dataMax + 0.15"]} tickFormatter={(value) => pace(1000 / (Number(value) * 60))} tick={{ fontSize: 10, fill: "#7b8983" }} tickLine={false} axisLine={false} width={48} /><Tooltip formatter={(value) => [`${Math.floor(Number(value))}:${pad(Math.round((Number(value) % 1) * 60))} /km`, "Tempo"]} /><Bar dataKey="pace" fill="#ef6545" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
  </section>;
}
