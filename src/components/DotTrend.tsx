import { fmtDay } from "@/lib/format";

// Zuinigheidsindex per run (100 = typisch voor dat runtype), met glijdend mediaanverloop.
export function DotTrend({ points }: { points: { date: string; value: number; name: string }[] }) {
  if (points.length < 3) return <p className="p-empty">Nog te weinig runs met hartslag voor een trendlijn.</p>;
  const w = 640; const h = 190; const padX = 8; const padY = 14;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 92); const max = Math.max(...values, 108);
  const t0 = new Date(points[0].date).getTime(); const t1 = new Date(points.at(-1)!.date).getTime();
  const x = (d: string) => t1 === t0 ? w / 2 : padX + ((new Date(d).getTime() - t0) / (t1 - t0)) * (w - padX * 2);
  const y = (v: number) => h - padY - ((v - min) / (max - min)) * (h - padY * 2);
  const smooth = points.map((p, i) => { const win = points.slice(Math.max(0, i - 2), Math.min(points.length, i + 3)).map((q) => q.value).sort((a, b) => a - b); return { date: p.date, value: win[Math.floor(win.length / 2)] }; });
  const path = smooth.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  return <figure className="p-dottrend"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Zuinigheid van ${points.length} runs`}>
    <line x1="0" x2={w} y1={y(100)} y2={y(100)} stroke="currentColor" strokeOpacity=".3" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
    {points.map((p, index) => <circle key={`${p.date}-${index}`} cx={x(p.date)} cy={y(p.value)} r="4.5" fill="var(--series-run)" fillOpacity=".45" vectorEffect="non-scaling-stroke"><title>{`${fmtDay(p.date, true)} · ${p.name} · index ${p.value.toLocaleString("nl-NL")}`}</title></circle>)}
    <path d={path} fill="none" stroke="var(--series-vo2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg><figcaption><span>{fmtDay(points[0].date)}</span><span>Index 100 = typisch voor dat runtype · hoger is zuiniger</span><span>{fmtDay(points.at(-1)!.date)}</span></figcaption></figure>;
}
