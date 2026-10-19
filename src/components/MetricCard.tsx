import Link from "next/link";
import { fmtNum, fmtSigned } from "@/lib/format";
import type { HealthTrend } from "@/lib/training-health";
import { badgeLabel, badgeTone } from "@/lib/metric-guide";
import { Spark } from "./Spark";

export function MetricCard({ trend, color, digits = 0, href, note, compact = false }: { trend: HealthTrend; color: string; digits?: number; href?: string; note?: string; compact?: boolean }) {
  const age = trend.currentAgeDays;
  const missing = trend.current == null;
  const stale = age != null && age > 14;
  const body = <>
    <div className="p-metric-top"><span className="p-metric-label">{trend.label}</span>{!missing && (stale ? <span className="p-badge">Verouderd</span> : <span className={`p-badge p-badge-${badgeTone(trend)}`}>{badgeLabel(trend)}</span>)}</div>
    <div className="p-metric-value">{missing ? <span className="p-metric-empty">Geen recente data</span> : <><strong>{fmtNum(trend.current, digits)}</strong><small>{trend.unit}</small></>}</div>
    {!missing && <p className="p-metric-meta">{trend.baseline != null ? <>Basis {fmtNum(trend.baseline, digits)} · <b>{fmtSigned(trend.deltaPct, 1, "%")}</b></> : "Basislijn bouwt op"}</p>}
    {missing && <p className="p-metric-meta">{age != null ? `Laatste meting ${age} dagen geleden` : "Nog nooit ontvangen"}</p>}
    {!compact && !missing && <><Spark points={trend.series} color={color} baseline={trend.baseline} /><p className="p-metric-age">Laatste 90 dagen · stippellijn is je basis</p></>}
    {!missing && age != null && age >= 2 && <p className="p-metric-age">Gemeten {age} dagen geleden</p>}
    {note && <p className="p-metric-note">{note}</p>}
  </>;
  return href ? <Link href={href} className="p-metric">{body}</Link> : <article className="p-metric">{body}</article>;
}
