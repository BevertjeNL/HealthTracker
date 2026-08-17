import { Sparkline } from "./Sparkline";

type Point = { date: string; value: number | null };

export function StatTile({
  label,
  value,
  delta,
  deltaIsGood,
  trend,
  trendColor = "var(--series-blue)",
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaIsGood?: boolean;
  trend?: Point[];
  trendColor?: string;
}) {
  return (
    <div
      className="flex flex-col justify-between gap-3 rounded-xl p-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
        {delta && (
          <p
            className="mt-0.5 text-xs font-medium"
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
