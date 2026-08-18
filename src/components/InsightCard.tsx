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

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div
      className="flex gap-3 rounded-xl p-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: statusColor[insight.status] }}
        aria-hidden
      />
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {statusLabel[insight.status]}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {insight.text}
        </p>
      </div>
    </div>
  );
}
