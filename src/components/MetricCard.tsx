import Link from "next/link";
import { fmtNum, fmtSigned } from "@/lib/format";
import type { HealthTrend } from "@/lib/training-health";
import { Spark } from "./Spark";

const DIRECTION_LABEL = { better: "Beter dan je basis", worse: "Slechter dan je basis", flat: "Zoals je gewend bent", changed: "Veranderd t.o.v. basis", unknown: "Geen basislijn" } as const;

export function MetricCard({ trend, color, digits = 0, href, note, compact = false }: { trend: HealthTrend; color: string; digits?: number; href?: string; note?: string; compact?: boolean }) {
  const age = trend.currentAgeDays;
  const missing = trend.current == null;
  const stale = age != null && age > 14;
  const body = <>
    <div className="p-metric-top"><span className="p-metric-label">{trend.label}</span>{!missing && (stale ? <span className="p-badge">Verouderd</span> : <span className={`p-badge p-badge-${trend.direction}`}>{DIRECTION_LABEL[trend.direction]}</span>)}</div>
    <div className="p-metric-value">{missing ? <span className="p-metric-empty">Geen recente data</span> : <><strong>{fmtNum(trend.current, digits)}</strong><small>{trend.unit}</small></>}</div>
    {!missing && <p className="p-metric-meta">{trend.baseline != null ? <>Basis {fmtNum(trend.baseline, digits)} · <b>{fmtSigned(trend.deltaPct, 1, "%")}</b></> : "Basislijn bouwt op"}</p>}
    {missing && <p className="p-metric-meta">{age != null ? `Laatste meting ${age} dagen geleden` : "Nog nooit ontvangen"}</p>}
    {!compact && !missing && <Spark points={trend.series} color={color} baseline={trend.baseline} />}
    {!missing && age != null && age >= 2 && <p className="p-metric-age">Gemeten {age} dagen geleden</p>}
    {note && <p className="p-metric-note">{note}</p>}
  </>;
  return href ? <Link href={href} className="p-metric">{body}</Link> : <article className="p-metric">{body}</article>;
}
