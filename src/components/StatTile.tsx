import { Sparkline } from "./Sparkline";

type Point = { date: string; value: number | null };

export function StatTile({
  label,
  value,
  delta,
  deltaIsGood,
  trend,
  trendColor = "var(--series-blue)",
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaIsGood?: boolean;
  trend?: Point[];
  trendColor?: string;
  icon?: "moon" | "pulse" | "run" | "trend";
  tone?: "violet" | "mint" | "orange" | "blue";
}) {
  const iconPaths = {
    moon: <path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" />,
    pulse: <path d="M3 12h4l2.2-6 4 12 2.3-6H21" />,
    run: <><circle cx="15" cy="4" r="2" /><path d="m8 21 3-5 2 2 1 3M6 12l4-4 4 2 3 3 3-1M11 8l-1 8" /></>,
    trend: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
  };
  return (
    <div className={`stat-tile stat-${tone}`}>
      <div>
        <div className="stat-label">{icon && <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{iconPaths[icon]}</svg></span>}<p>{label}</p></div>
        <p className="stat-value">{value}</p>
        {delta && (
          <p
            className="stat-delta"
            style={{ color: deltaIsGood ? "var(--delta-good)" : "var(--text-secondary)" }}
          >
            {delta}
          </p>
        )}
      </div>
      {trend && trend.length >= 2 && (
        <div className="self-end">
          <Sparkline points={trend} color={trendColor} />
        </div>
      )}
    </div>
  );
}
