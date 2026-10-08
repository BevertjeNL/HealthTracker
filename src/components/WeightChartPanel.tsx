"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { manualValueDomain, selectChartWindow } from "@/lib/chart-range";

type Point = { date: string; value: number | null };

function daysBefore(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

export function WeightChartPanel({ points, today }: { points: Point[]; today: string }) {
  const sorted = useMemo(() => [...points].sort((a, b) => a.date.localeCompare(b.date)), [points]);
  const earliest = sorted[0]?.date.slice(0, 10) ?? daysBefore(today, 89);
  const [start, setStart] = useState(earliest);
  const [end, setEnd] = useState(today);
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const visible = useMemo(() => selectChartWindow(sorted, start, end), [sorted, start, end]);
  const yAxis = manualValueDomain(visible ?? [], lower, upper);
  const xError = visible == null ? "De begindatum moet voor de einddatum liggen." : null;

  function choosePeriod(days: number | null) {
    setStart(days == null ? earliest : daysBefore(today, days - 1));
    setEnd(today);
  }

  const controls = <div className="w-controls">
    <div className="w-presets" aria-label="Snel een periode kiezen">
      {[{ days: 30, label: "30 dagen" }, { days: 90, label: "90 dagen" }, { days: 365, label: "1 jaar" }, { days: null, label: "Alles" }].map((item) =>
        <button key={item.label} type="button" onClick={() => choosePeriod(item.days)} aria-pressed={start === (item.days == null ? earliest : daysBefore(today, item.days - 1)) && end === today}>{item.label}</button>,
      )}
    </div>
    <div className="w-axis-grid">
      <fieldset><legend>X-as · periode</legend><label>Van<input type="date" value={start} max={today} onChange={(event) => setStart(event.target.value)} aria-invalid={Boolean(xError)} /></label><label>Tot<input type="date" value={end} max={today} onChange={(event) => setEnd(event.target.value)} aria-invalid={Boolean(xError)} /></label></fieldset>
      <fieldset><legend>Y-as · gewicht in kg</legend><label>Minimum<input type="number" step="0.1" inputMode="decimal" placeholder="Auto" value={lower} onChange={(event) => setLower(event.target.value)} aria-invalid={Boolean(yAxis.error)} /></label><label>Maximum<input type="number" step="0.1" inputMode="decimal" placeholder="Auto" value={upper} onChange={(event) => setUpper(event.target.value)} aria-invalid={Boolean(yAxis.error)} /></label><button type="button" onClick={() => { setLower(""); setUpper(""); }}>Auto</button></fieldset>
    </div>
    {(xError || yAxis.error) && <p className="w-error" role="alert">{xError || yAxis.error}</p>}
    <p className="w-count" aria-live="polite">{visible?.filter((point) => point.value != null).length ?? 0} metingen in dit bereik · lege Y-velden schalen automatisch</p>
  </div>;

  return <section className="w-section" aria-labelledby="weight-title"><div className="c-section-heading"><div><span className="c-overline">APPLE HEALTH · GEWICHT</span><h2 id="weight-title">Je gewicht in context.</h2></div></div>
    <p className="w-intro">Bekijk de metingen over een periode naar keuze. Stel beide assen zelf in om kleine veranderingen beter te zien.</p>
    <TrendChart title="Gewicht" subtitle="Metingen uit Apple Health" points={visible ?? []} color="var(--series-blue)" unit="kg" dateDomain={visible ? [start, end] : undefined} valueDomain={xError || yAxis.error ? undefined : yAxis.domain} controls={controls} />
  </section>;
}
