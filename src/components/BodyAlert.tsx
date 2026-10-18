import type { BodyAlert as Alert } from "@/lib/training-health";

export function BodyAlert({ alert, healthAgeDays }: { alert: Alert; healthAgeDays: number | null }) {
  const label = alert.level === "stop" ? "RUST NEMEN" : alert.level === "let-op" ? "LET OP" : "LICHAAM";
  return <section className={`p-alert p-alert-${alert.level}`} aria-label="Lichaamssignalen">
    <span className="p-alert-label">{label}</span>
    <div><h2>{alert.title}</h2><p>{alert.detail}</p>{alert.signals.length > 0 && <ul>{alert.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>}{healthAgeDays != null && healthAgeDays >= 2 && <small>Gebaseerd op Health-gegevens van {healthAgeDays} dagen geleden. Synchroniseer voor een actueel beeld.</small>}</div>
  </section>;
}
