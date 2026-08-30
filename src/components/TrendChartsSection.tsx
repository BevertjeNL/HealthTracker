"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "@/components/TrendChart";

type Point = { date: string; value: number | null };

const RANGE_OPTIONS = [
  { days: 14, label: "14 dagen" },
  { days: 30, label: "30 dagen" },
  { days: 60, label: "60 dagen" },
  { days: 90, label: "90 dagen" },
  { days: 180, label: "6 maanden" },
  { days: 365, label: "1 jaar" },
  { days: 730, label: "2 jaar" },
] as const;

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function formatRangeDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TrendChartsSection({
  weightPoints,
  pacePoints,
  today,
}: {
  weightPoints: Point[];
  pacePoints: Point[];
  today: string;
}) {
  return (
    <section className="trend-section" aria-labelledby="trend-section-title">
      <div className="section-heading chart-range-heading">
        <div>
          <span className="eyebrow">Ontdek het patroon</span>
          <h2 id="trend-section-title">Gezondheid × prestatie</h2>
        </div>
        <span className="context-pill">Per grafiek instelbaar</span>
      </div>
      <div className="chart-grid">
        <AdjustableTrendChart
          id="weight-range"
          title="Gewicht"
          subtitle="7-daags gemiddelde"
          points={weightPoints}
          today={today}
          color="var(--series-blue)"
          unit="kg"
          defaultRangeIndex={3}
          countLabel="metingen"
        />
        <AdjustableTrendChart
          id="pace-range"
          title="Tempo per run"
          subtitle="Lager is sneller"
          points={pacePoints}
          today={today}
          color="var(--series-orange)"
          unit="pace"
          defaultRangeIndex={5}
          countLabel="runs"
          reversed
        />
      </div>
    </section>
  );
}

function AdjustableTrendChart({
  id,
  title,
  subtitle,
  points,
  today,
  color,
  unit,
  defaultRangeIndex,
  countLabel,
  reversed = false,
}: {
  id: string;
  title: string;
  subtitle: string;
  points: Point[];
  today: string;
  color: string;
  unit: "kg" | "pace";
  defaultRangeIndex: number;
  countLabel: string;
  reversed?: boolean;
}) {
  const [rangeIndex, setRangeIndex] = useState(defaultRangeIndex);
  const selectedRange = RANGE_OPTIONS[rangeIndex];
  const cutoff = useMemo(
    () => shiftDate(today, -(selectedRange.days - 1)),
    [selectedRange.days, today],
  );
  const visiblePoints = useMemo(
    () => points.filter((point) => point.date.slice(0, 10) >= cutoff && point.date.slice(0, 10) <= today),
    [cutoff, points, today],
  );
  const visibleCount = visiblePoints.filter((point) => point.value != null).length;

  const controls = (
    <div className="chart-card-range">
      <div className="chart-range-copy">
        <label htmlFor={id}>Bereik: <strong>{selectedRange.label}</strong></label>
        <output htmlFor={id}>{formatRangeDate(cutoff)} – {formatRangeDate(today)}</output>
      </div>
      <input
        id={id}
        type="range"
        min="0"
        max={RANGE_OPTIONS.length - 1}
        step="1"
        value={rangeIndex}
        onChange={(event) => setRangeIndex(Number(event.target.value))}
        aria-label={`Zichtbaar bereik voor ${title}`}
        aria-valuetext={selectedRange.label}
      />
      <div className="chart-range-ends" aria-hidden="true">
        <span>14 dagen</span>
        <span>2 jaar</span>
      </div>
      <p className="chart-card-range-count" aria-live="polite">
        {visibleCount} {countLabel} zichtbaar
      </p>
    </div>
  );

  return (
    <TrendChart
      title={title}
      subtitle={subtitle}
      points={visiblePoints}
      color={color}
      unit={unit}
      reversed={reversed}
      controls={controls}
    />
  );
}
