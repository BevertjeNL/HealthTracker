"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { correctWeightAction, type WeightActionState } from "@/app/actions";
import { RangeSlider } from "@/components/RangeSlider";
import { TrendChart } from "@/components/TrendChart";
import { smoothWeightPoints } from "@/lib/weight-trend";
import {
  addChartDays,
  chartDaysBetween,
  DEFAULT_CHART_SETTINGS,
  manualValueDomain,
  MIN_CHART_SPAN_DAYS,
  parseChartSettings,
  resolveChartWindow,
  selectChartWindow,
  valueSliderBounds,
  type ChartPreset,
  type ChartSettings,
} from "@/lib/chart-range";

type Point = { date: string; value: number | null };

const STORAGE_KEY = "pulse.weight-chart.v1";
const PRESETS: { value: ChartPreset; label: string }[] = [
  { value: 30, label: "30 dagen" },
  { value: 90, label: "90 dagen" },
  { value: 365, label: "1 jaar" },
  { value: "all", label: "Alles" },
];

// Instellingen leven in localStorage; het geheugen vangt af wanneer opslag geblokkeerd is.
const listeners = new Set<() => void>();
let memoryRaw: string | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readStored() {
  if (memoryRaw != null) return memoryRaw;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSettings(next: ChartSettings) {
  memoryRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, memoryRaw);
  } catch {
    // Opslaan mislukt (bijvoorbeeld privévenster): de keuze geldt dan tot de pagina sluit.
  }
  listeners.forEach((listener) => listener());
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("nl-NL", { timeZone: "UTC", day: "numeric", month: "short", year: "2-digit" });
}

export function WeightChartPanel({ points, today }: { points: Point[]; today: string }) {
  const sorted = useMemo(() => [...points].sort((a, b) => a.date.localeCompare(b.date)), [points]);
  const [selectedDate, setSelectedDate] = useState("");
  const [correctionState, correctionAction, correctionPending] = useActionState<WeightActionState, FormData>(correctWeightAction, { message: "", ok: false });
  const firstDate = sorted[0]?.date.slice(0, 10) ?? addChartDays(today, -89);
  const earliest = chartDaysBetween(firstDate, today) < MIN_CHART_SPAN_DAYS * 2 ? addChartDays(today, -MIN_CHART_SPAN_DAYS * 2) : firstDate;
  const totalDays = chartDaysBetween(earliest, today);

  const settings = parseChartSettings(useSyncExternalStore(subscribe, readStored, () => null));

  const [start, end] = resolveChartWindow(settings, earliest, today);
  const visible = selectChartWindow(sorted, start, end);
  const smoothed = useMemo(() => smoothWeightPoints(sorted), [sorted]);
  const trendVisible = settings.smooth ? selectChartWindow(smoothed, start, end) ?? [] : undefined;
  const measured = visible?.filter((point): point is { date: string; value: number } => point.value != null) ?? [];
  const selected = measured.find((point) => point.date === selectedDate) ?? measured.at(-1);
  const yAxis = manualValueDomain(trendVisible ?? visible ?? [], settings.lower == null ? "" : String(settings.lower), settings.upper == null ? "" : String(settings.upper));
  const bounds = valueSliderBounds(sorted, settings.lower, settings.upper);
  const customized = settings.preset !== "all" || settings.lower != null || settings.upper != null || settings.smooth;

  function update(patch: Partial<ChartSettings>) {
    saveSettings({ ...settings, ...patch });
  }

  function setWindow([from, to]: [number, number]) {
    update({ preset: null, start: addChartDays(earliest, from), end: addChartDays(earliest, to) });
  }

  const controls = <div className="w-controls">
    <div className="w-bar">
      <div className="w-presets" role="group" aria-label="Snel een periode kiezen">
        {PRESETS.map((item) => <button key={item.label} type="button" onClick={() => update({ preset: item.value, start: null, end: null })} aria-pressed={settings.preset === item.value}>{item.label}</button>)}
      </div>
      <button type="button" className="w-reset" onClick={() => saveSettings(DEFAULT_CHART_SETTINGS)} disabled={!customized}>Herstel</button>
    </div>
    <div className="w-curve-choice" role="group" aria-label="Weergave van de gewichtslijn">
      <button type="button" onClick={() => update({ smooth: false })} aria-pressed={!settings.smooth}>Metingen</button>
      <button type="button" onClick={() => update({ smooth: true })} aria-pressed={settings.smooth}>Vloeiende lijn</button>
      <span>{settings.smooth ? "7-daags gewogen gemiddelde; statistieken blijven gebaseerd op je metingen." : "Elke weging en dagschommeling zichtbaar."}</span>
    </div>
    <details className="w-exact">
      <summary>Exact instellen</summary>
      <div className="w-axis-grid">
        <fieldset><legend>Periode</legend>
          <label>Van<input type="date" value={start} max={today} onChange={(event) => event.target.value && update({ preset: null, start: event.target.value, end })} /></label>
          <label>Tot<input type="date" value={end} max={today} onChange={(event) => event.target.value && update({ preset: null, start, end: event.target.value })} /></label>
        </fieldset>
        <fieldset><legend>Gewicht in kg</legend>
          <label>Minimum<input type="number" step="0.1" inputMode="decimal" placeholder="Auto" value={settings.lower ?? ""} onChange={(event) => update({ lower: event.target.value === "" ? null : Number(event.target.value) })} aria-invalid={Boolean(yAxis.error)} /></label>
          <label>Maximum<input type="number" step="0.1" inputMode="decimal" placeholder="Auto" value={settings.upper ?? ""} onChange={(event) => update({ upper: event.target.value === "" ? null : Number(event.target.value) })} aria-invalid={Boolean(yAxis.error)} /></label>
        </fieldset>
      </div>
      {yAxis.error && <p className="w-error" role="alert">{yAxis.error}</p>}
    </details>
  </div>;

  const yValue: [number, number] | null = bounds ? (yAxis.domain ?? valueSliderBounds(visible ?? [], null, null) ?? bounds) : null;
  const aside = bounds && yValue && <RangeSlider orientation="vertical" min={bounds[0]} max={bounds[1]} step={0.1} minGap={0.5} value={[Math.max(bounds[0], Math.floor(yValue[0] * 10) / 10), Math.min(bounds[1], Math.ceil(yValue[1] * 10) / 10)]} onChange={([lower, upper]) => update({ lower, upper })} label="Gewicht" format={(v) => `${v.toFixed(1)} kg`} />;
  const footer = <div className="w-x">
    <RangeSlider orientation="horizontal" min={0} max={totalDays} step={1} minGap={MIN_CHART_SPAN_DAYS} value={[chartDaysBetween(earliest, start), chartDaysBetween(earliest, end)]} onChange={setWindow} label="Periode" format={(v) => shortDate(addChartDays(earliest, v))} />
    <p className="w-x-labels" aria-live="polite"><span>{shortDate(start)}</span><span>{visible?.filter((point) => point.value != null).length ?? 0} metingen</span><span>{shortDate(end)}</span></p>
  </div>;

  return <section className="w-section" aria-labelledby="weight-title"><div className="c-section-heading"><div><span className="c-overline">APPLE HEALTH · GEWICHT</span><h2 id="weight-title">Je gewicht in context.</h2></div></div>
    <TrendChart title="Gewicht" subtitle="Sleep de handvatten om in of uit te zoomen" points={visible ?? []} displayPoints={trendVisible} displayLabel={settings.smooth ? "7-daagse trend" : undefined} color="var(--series-blue)" unit="kg" dateDomain={[start, end]} valueDomain={yAxis.error ? undefined : yAxis.domain} controls={controls} chartAside={aside} chartFooter={footer} />
    {selected && <form className="w-correction" action={correctionAction} onSubmit={(event) => {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if (submitter?.value === "remove" && !window.confirm(`Gewichtsmeting van ${selected.date} uit Pulse verwijderen?`)) event.preventDefault();
    }}>
      <h3>Meting corrigeren</h3>
      <p>Een verwijderde Health-meting blijft in Pulse staan tot je deze hier verwijdert.</p>
      <div className="w-correction-fields">
        <label>Meetdatum<select name="date" value={selected.date} onChange={(event) => setSelectedDate(event.target.value)}>{measured.map((point) => <option key={point.date} value={point.date}>{new Date(`${point.date}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })} · {point.value.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} kg</option>)}</select></label>
        <label>Gewicht in kg<input key={`${selected.date}:${selected.value}`} name="weightKg" type="text" inputMode="decimal" defaultValue={String(selected.value).replace(".", ",")} aria-describedby="w-correction-help" /></label>
      </div>
      <p id="w-correction-help">Gebruik een komma of punt als decimaalteken. Kies Verwijder meting als die ook uit Health is gewist.</p>
      <div className="w-correction-actions"><button type="submit" name="operation" value="save" disabled={correctionPending}>Waarde opslaan</button><button type="submit" name="operation" value="remove" disabled={correctionPending}>Verwijder meting</button></div>
      {correctionState.message && <p className={correctionState.ok ? "w-success" : "w-error"} role="status">{correctionState.message}</p>}
    </form>}
  </section>;
}
