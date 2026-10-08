import type { CoachVerdict as Verdict } from "@/lib/coach-verdict";

export function CoachVerdict({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  return <div className={`c-verdict c-verdict-${verdict.tone}${compact ? " compact" : ""}`}>
    <strong className="c-verdict-label">{verdict.tone === "good" ? "GOED" : verdict.tone === "critical" ? "INGRIJPEN" : verdict.tone === "warning" ? "LET OP" : "NOG ONBEKEND"} · {verdict.label}</strong>
    <p>{verdict.reason}</p>
    <p className="c-verdict-action"><b>Doe dit:</b> {verdict.action}</p>
  </div>;
}
