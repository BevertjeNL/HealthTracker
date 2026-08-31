import { Sparkline } from "./Sparkline";

type Point = { date: string; value: number | null };

export type SupportingMetric = {
  label: string;
  value: string;
};

export function HealthOverviewTile({
  title,
  symbol,
  tone,
  value,
  valueLabel,
  context,
  contextIsGood,
  supporting,
  trend,
  trendColor,
  trendPeriod,
  trendChange,
}: {
  title: string;
  symbol: string;
  tone: "mint" | "violet" | "orange" | "blue";
  value: string;
  valueLabel: string;
  context: string;
  contextIsGood?: boolean;
  supporting: SupportingMetric[];
  trend?: Point[];
  trendColor: string;
  trendPeriod?: string;
  trendChange?: string;
}) {
  return (
    <article className={`health-overview-tile overview-${tone}`}>
      <div className="overview-tile-heading">
        <span className="overview-symbol" aria-hidden>{symbol}</span>
        <div>
          <span>Jouw trend</span>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="overview-primary">
        <div>
          <strong>{value}</strong>
          <small>{valueLabel}</small>
        </div>
        {trend && trend.filter((point) => point.value != null).length >= 2 && (
          <div className="overview-mini-trend">
            <Sparkline
              points={trend}
              color={trendColor}
              width={112}
              height={42}
              label={`${title}: ${trendPeriod ?? "recente trend"}${trendChange ? `, ${trendChange}` : ""}`}
            />
            <span>{trendPeriod ?? "Recente trend"}</span>
            {trendChange && <strong>{trendChange}</strong>}
          </div>
        )}
      </div>

      <p className={`overview-context ${contextIsGood ? "positive" : ""}`}>{context}</p>

      <div className="overview-supporting">
        {supporting.map((metric) => (
          <span key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </span>
        ))}
      </div>
    </article>
  );
}
