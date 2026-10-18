// Server-side SVG sparkline: geen client-JS nodig en leesbaar op elke breedte.
export function Spark({ points, color, height = 44, baseline }: { points: { date: string; value: number | null }[]; color: string; height?: number; baseline?: number | null }) {
  const data = points.filter((point): point is { date: string; value: number } => point.value != null);
  if (data.length < 3) return <div className="p-spark p-spark-empty" style={{ height }}>te weinig metingen</div>;
  const width = 160;
  const values = data.map((point) => point.value);
  const ref = baseline != null ? [...values, baseline] : values;
  const min = Math.min(...ref); const max = Math.max(...ref);
  const span = max - min || 1;
  const t0 = new Date(data[0].date).getTime(); const t1 = new Date(data.at(-1)!.date).getTime();
  const x = (date: string) => t1 === t0 ? width / 2 : ((new Date(date).getTime() - t0) / (t1 - t0)) * (width - 6) + 3;
  const y = (value: number) => height - 4 - ((value - min) / span) * (height - 10);
  const line = data.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.at(-1)!.date).toFixed(1)} ${height} L${x(data[0].date).toFixed(1)} ${height} Z`;
  const last = data.at(-1)!;
  return <svg className="p-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Verloop over ${data.length} metingen`}>
    {baseline != null && <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)} stroke="currentColor" strokeOpacity=".28" strokeDasharray="3 3" />}
    <path d={area} fill={color} fillOpacity=".12" />
    <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <circle cx={x(last.date)} cy={y(last.value)} r="3" fill={color} vectorEffect="non-scaling-stroke" />
  </svg>;
}
