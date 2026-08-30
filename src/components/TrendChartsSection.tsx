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
  const [rangeIndex, setRangeIndex] = useState(5);
  const selectedRange = RANGE_OPTIONS[rangeIndex];
  const cutoff = useMemo(
    () => shiftDate(today, -(selectedRange.days - 1)),
    [selectedRange.days, today],
  );
  const visibleWeight = useMemo(
    () => weightPoints.filter((point) => point.date.slice(0, 10) >= cutoff && point.date.slice(0, 10) <= today),
    [cutoff, today, weightPoints],
  );
  const visiblePace = useMemo(
    () => pacePoints.filter((point) => point.date.slice(0, 10) >= cutoff && point.date.slice(0, 10) <= today),
    [cutoff, pacePoints, today],
  );
  const visibleWeightCount = visibleWeight.filter((point) => point.value != null).length;
  const visiblePaceCount = visiblePace.filter((point) => point.value != null).length;

  return (
    <section className="trend-section" aria-labelledby="trend-section-title">
      <div className="section-heading chart-range-heading">
        <div>
          <span className="eyebrow">Ontdek het patroon</span>
          <h2 id="trend-section-title">Gezondheid × prestatie</h2>
        </div>
        <span className="context-pill">Laatste {selectedRange.label}</span>
      </div>

      <div className="chart-range-control">
        <div className="chart-range-copy">
          <label htmlFor="chart-range">Kies het zichtbare bereik</label>
          <output htmlFor="chart-range">
            {formatRangeDate(cutoff)} – {formatRangeDate(today)}
          </output>
        </div>
        <input
          id="chart-range"
          type="range"
          min="0"
          max={RANGE_OPTIONS.length - 1}
          step="1"
          value={rangeIndex}
          onChange={(event) => setRangeIndex(Number(event.target.value))}
          aria-valuetext={selectedRange.label}
        />
        <div className="chart-range-ends" aria-hidden="true">
          <span>14 dagen</span>
          <span>2 jaar</span>
        </div>
        <p className="chart-range-status" aria-live="polite">
          <span>Gewicht: <strong>{visibleWeightCount} metingen</strong></span>
          <span>Tempo: <strong>{visiblePaceCount} runs</strong></span>
        </p>
      </div>

      <div className="chart-grid">
        <TrendChart title="Gewicht" subtitle="7-daags gemiddelde" points={visibleWeight} color="var(--series-blue)" unit="kg" />
        <TrendChart title="Tempo per run" subtitle="Lager is sneller" points={visiblePace} color="var(--series-orange)" unit="pace" reversed />
      </div>
    </section>
  );
}
