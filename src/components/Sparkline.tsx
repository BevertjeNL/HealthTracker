type Point = { date: string; value: number | null };

/** Minimal inline trend line — no axes/tooltip, just the shape of the last N points. */
export function Sparkline({
  points,
  color = "var(--series-blue)",
  height = 32,
  width = 96,
  label = "Trendgrafiek",
}: {
  points: Point[];
  color?: string;
  height?: number;
  width?: number;
  label?: string;
}) {
  const valid = points.filter((point): point is { date: string; value: number } => point.value != null);
  const values = valid.map((point) => point.value);
  if (valid.length < 2) {
    return <div style={{ height, width }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min;
  const padding = Math.max(rawRange * 0.18, Math.abs((max + min) / 2) * 0.008, 0.5);
  const domainMin = min - padding;
  const domainMax = max + padding;
  const range = domainMax - domainMin || 1;
  const firstTime = new Date(`${valid[0].date}T12:00:00Z`).getTime();
  const lastTime = new Date(`${valid.at(-1)!.date}T12:00:00Z`).getTime();
  const timeRange = lastTime - firstTime || 1;

  const coords: [number, number][] = valid.map((point) => {
    const timestamp = new Date(`${point.date}T12:00:00Z`).getTime();
    const x = ((timestamp - firstTime) / timeRange) * width;
    const y = height - ((point.value - domainMin) / range) * (height - 5) - 2.5;
    return [x, y];
  });

  const path = coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const first = coords[0];
  const last = coords.at(-1)!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img" aria-label={label}>
      <title>{label}</title>
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 4" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={first[0]} cy={first[1]} r={2.2} fill="var(--surface-1)" stroke={color} strokeWidth={1.5} />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}
