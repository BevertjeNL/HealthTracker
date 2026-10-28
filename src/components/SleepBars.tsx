import { fmtDay } from "@/lib/format";
import { fmtDuration, SLEEP_TARGET_MIN, type SleepNight } from "@/lib/sleep";

const STAGES = [
  { key: "deepMin", label: "Diep", color: "var(--series-vo2)" },
  { key: "remMin", label: "REM", color: "var(--series-weight)" },
  { key: "coreMin", label: "Kern", color: "var(--series-chronic)" },
] as const;

// Server-side SVG: een staaf per nacht, gestapeld per slaapfase, met je slaapdoel als stippellijn.
export function SleepBars({ nights }: { nights: SleepNight[] }) {
  if (nights.length < 3) return <p className="p-empty">Nog te weinig nachten voor een grafiek (minimaal 3).</p>;
  const w = 640; const h = 220; const left = 34; const bottom = 22;
  const maxMin = Math.max(SLEEP_TARGET_MIN + 60, ...nights.map((night) => night.asleepMin + (night.awakeMin ?? 0)));
  const top = Math.ceil(maxMin / 120) * 120;
  const y = (minutes: number) => h - bottom - (minutes / top) * (h - bottom - 8);
  const slot = (w - left) / nights.length;
  const bar = Math.max(3, slot * 0.68);
  const ticks = Array.from({ length: top / 120 + 1 }, (_, index) => index * 120);
  const labelEvery = Math.ceil(nights.length / 6);
  return <figure className="p-sleep-chart">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Slaapduur van de laatste ${nights.length} nachten, per slaapfase`}>
      {ticks.map((tick) => <g key={tick}><line x1={left} x2={w} y1={y(tick)} y2={y(tick)} stroke="var(--gridline)" strokeDasharray="3 4" /><text x={left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{tick / 60}u</text></g>)}
      <line x1={left} x2={w} y1={y(SLEEP_TARGET_MIN)} y2={y(SLEEP_TARGET_MIN)} stroke="var(--series-run)" strokeWidth="1.5" strokeDasharray="5 4" />
      {nights.map((night, index) => {
        const x = left + index * slot + (slot - bar) / 2;
        let cursor = 0;
        const staged = night.deepMin != null && night.remMin != null && night.coreMin != null;
        const segments = staged ? STAGES.map((stage) => ({ color: stage.color, minutes: night[stage.key] ?? 0 })) : [{ color: "var(--series-chronic)", minutes: night.asleepMin }];
        return <g key={night.date}>
          <title>{`${fmtDay(night.date, true)}: ${fmtDuration(night.asleepMin)} slaap`}</title>
          {segments.map((segment, i) => { const rect = <rect key={i} x={x} y={y(cursor + segment.minutes)} width={bar} height={Math.max(0, y(cursor) - y(cursor + segment.minutes))} fill={segment.color} />; cursor += segment.minutes; return rect; })}
          {index % labelEvery === 0 && <text x={x + bar / 2} y={h - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">{fmtDay(night.date)}</text>}
        </g>;
      })}
    </svg>
    <figcaption className="p-sleep-legend">{STAGES.map((stage) => <span key={stage.key}><i style={{ background: stage.color }} />{stage.label}</span>)}<span><i className="p-sleep-target" />Doel {fmtDuration(SLEEP_TARGET_MIN)}</span></figcaption>
  </figure>;
}
