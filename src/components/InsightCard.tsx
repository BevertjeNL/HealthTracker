import type { Insight } from "@/lib/insights";

const statusColor: Record<Insight["status"], string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  neutral: "var(--text-muted)",
};

const statusLabel: Record<Insight["status"], string> = {
  good: "Positief",
  warning: "Let op",
  neutral: "Neutraal",
};

export function InsightCard({ insight, index }: { insight: Insight; index?: number }) {
  return (
    <div className="insight-card">
      <span
        className="insight-index"
        style={{ background: statusColor[insight.status] }}
        aria-hidden>{index ?? "•"}</span>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {statusLabel[insight.status]} · betrouwbaarheid {insight.confidence}
        </p>
        <h3 className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {insight.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {insight.text}
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <strong>Advies:</strong> {insight.recommendation}
        </p>
      </div>
    </div>
  );
}
