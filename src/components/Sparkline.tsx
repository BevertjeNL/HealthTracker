type Point = { date: string; value: number | null };

/** Minimal inline trend line — no axes/tooltip, just the shape of the last N points. */
export function Sparkline({
  points,
  color = "var(--series-blue)",
  height = 32,
  width = 96,
}: {
  points: Point[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length < 2) {
    return <div style={{ height, width }} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  let x = 0;
  const coords: [number, number][] = [];
  for (const p of points) {
    if (p.value != null) {
      const y = height - ((p.value - min) / range) * (height - 4) - 2;
      coords.push([x, y]);
    }
    x += step;
  }

  const path = coords.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const last = coords.at(-1)!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}
