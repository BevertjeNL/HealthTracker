import type { activities } from "@/db/schema";
import type { buildCoachToday } from "./coach.ts";
import { addDays, daysBetween, type PlanDay } from "./goal-plan.ts";
import { dayDifference } from "./recovery.ts";
import { analyzePacing, classifyRun, KIND_LABEL, parseKmSplits, toAnalysisRun } from "./run-analysis.ts";
import { prescribeNextRun, restDaysAfter, type PrescriptionKind } from "./run-prescription.ts";

type Activity = typeof activities.$inferSelect;
type CoachToday = ReturnType<typeof buildCoachToday>;

export type NextRunBody = { alertLevel: "ok" | "let-op" | "stop"; alertSignals: string[]; hrvDeltaPct: number | null; rhrDeltaPct: number | null };
export type NextRunInput = { runs: Activity[]; coach: CoachToday; body: NextRunBody; planDays?: PlanDay[] | null };
export type NextRun = {
  /** 0 = vandaag, 1 = morgen, ... */
  offset: number;
  date: string;
  whenLabel: string;
  inLabel: string;
  title: string;
  detail: string;
  kind: PrescriptionKind;
  tone: "good" | "warning" | "critical";
  /** Korte feiten uit je eigen cijfers die bepalen waarom het deze dag is. Maximaal drie. */
  basis: string[];
  source: "schema" | "coach";
  /** Er is vandaag al gelopen: de eerstvolgende run begint ná vandaag. */
  ranToday: boolean;
};

const km = (value: number) => value.toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: Number.isInteger(value) ? 0 : 1 });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const whenLabel = (date: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(noon(date));
const MAX_LOOKAHEAD = 7;

function inLabel(offset: number) {
  if (offset <= 0) return "vandaag";
  if (offset === 1) return "morgen";
  return `over ${offset} dagen`;
}

/**
 * De eerstvolgende run: vandaag als het kan, anders de eerste dag waarop rust, belasting, herstel en
 * lichaamssignalen samen weer een loop toestaan. Met een actief wedstrijdschema bepaalt het schema de inhoud,
 * maar nooit een dag die te vroeg is of een zware sessie terwijl je lichaam om rust vraagt.
 */
export function buildNextRun({ runs, coach, body, planDays }: NextRunInput): NextRun {
  const today = coach.today;
  const last = coach.lastRun;
  const lastAge = last ? dayDifference(today, new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(last.startDate)) : null;
  const ranToday = lastAge === 0;
  const score = coach.recovery.score;
  const loadPct = coach.load.changePct;
  const adverse = (score != null && score < 58) || (loadPct != null && loadPct > 30 && (lastAge ?? 99) <= 2) || body.alertLevel === "stop";
  const easyOnly = adverse || body.alertLevel === "let-op" || coach.sleep.concern === true;
  const minOffset = body.alertLevel === "stop" ? 2 : adverse ? 1 : 0;
  const analysisRuns = [...runs].sort((a, b) => b.startDate.getTime() - a.startDate.getTime()).map(toAnalysisRun);
  const lastAnalysis = analysisRuns[0] ?? null;
  const lastKind = lastAnalysis ? classifyRun(lastAnalysis) : null;
  const maxHr = analysisRuns.reduce((max, item) => Math.max(max, item.maxHr ?? 0), 0) || null;
  const pacing = lastAnalysis && lastKind ? analyzePacing(parseKmSplits(lastAnalysis.raw), lastKind, { maxHrObserved: maxHr }) : null;

  // 1. Vandaag al een run staan? Dan begint het zoeken bij morgen. Anders geldt het dagadvies van vandaag als het een run is.
  let offset = -1;
  let found: { title: string; detail: string; kind: PrescriptionKind } | null = null;
  if (!ranToday && minOffset === 0 && coach.advice.kind !== "rest") {
    offset = 0;
    found = { title: coach.advice.label, detail: coach.advice.detail, kind: coach.advice.kind };
  }
  // 2. Anders: de eerste dag vooruit waarop de voorschrijving geen rust meer is.
  for (let step = Math.max(1, minOffset); !found && step <= minOffset + MAX_LOOKAHEAD; step++) {
    const date = addDays(today, step);
    const rx = prescribeNextRun({ runs: analysisRuns, now: noon(date), daysSinceLast: lastAge == null ? null : lastAge + step, readiness: null, loadChangePct: null, pacing, easyOnly });
    if (rx.kind !== "rest") { offset = step; found = { title: rx.title, detail: rx.detail, kind: rx.kind }; }
  }
  if (!found) { offset = Math.max(1, minOffset) + MAX_LOOKAHEAD; found = { title: "Rustige duurloop", detail: "30–40 min op een tempo waarop je volledige zinnen spreekt.", kind: "easy" }; }

  let date = addDays(today, offset);
  let source: NextRun["source"] = "coach";
  // 3. Actief schema: neem de eerstvolgende geplande training op of na die dag, tenzij ze te zwaar is voor je lichaam nu.
  if (planDays?.length) {
    const planned = planDays.find((day) => day.date >= date && day.tone !== "rest" && day.status === "planned");
    if (planned) {
      const heavy = planned.tone === "quality" || planned.tone === "long";
      if (!(easyOnly && heavy && daysBetween(planned.date, date) <= 1)) {
        offset = daysBetween(planned.date, today);
        date = planned.date;
        source = "schema";
        found = { title: planned.title, detail: planned.detail, kind: planned.tone === "quality" ? "quality" : planned.tone === "long" ? "long" : "easy" };
      }
    }
  }

  const basis: string[] = [];
  const needed = lastAnalysis ? restDaysAfter(lastAnalysis) : 0;
  if (last && lastAge != null && needed > 0 && lastAge < needed && offset > 0) basis.push(`${km(Math.round((last.distanceM ?? 0) / 100) / 10)} km ${lastKind ? KIND_LABEL[lastKind].toLowerCase() : ""} vraagt ${needed} rustdagen`.replace(/\s+/g, " "));
  if (score != null && score < 58) basis.push(`Herstel ${score}/100, onder je basislijn`);
  else if (loadPct != null && loadPct > 30) basis.push(`Weekbelasting ${loadPct}% boven je basis`);
  if (body.alertLevel !== "ok" && body.alertSignals.length) basis.push(body.alertSignals.slice(0, 2).join(" · "));
  else if (body.hrvDeltaPct != null && body.rhrDeltaPct != null) basis.push("HRV en rusthartslag binnen je normale bandbreedte");
  else if (score != null && score >= 70) basis.push(`Herstel ${score}/100`);
  if (basis.length < 3 && coach.sleep.concern && coach.sleep.latestHours != null && offset <= 1) basis.push(`Slaap ${coach.sleep.latestHours.toFixed(1).replace(".", ",")} uur: houd het rustig`);
  if (basis.length < 3 && loadPct != null && Math.abs(loadPct) <= 30) basis.push(`Belasting ${Math.abs(loadPct)}% ${loadPct >= 0 ? "boven" : "onder"} je 4-weekse basis`);
  else if (basis.length < 3 && coach.load.baselineKm != null && found.kind !== "quality") basis.push(`Afstand volgt uit je weekbasis van ${km(Math.round(coach.load.baselineKm))} km`);

  const delayed = minOffset > 0;
  const tone: NextRun["tone"] = body.alertLevel === "stop" || (score != null && score < 58) ? "critical" : delayed || easyOnly ? "warning" : "good";
  return { offset, date, whenLabel: offset === 0 ? "Vandaag" : whenLabel(date), inLabel: inLabel(offset), title: found.title, detail: found.detail, kind: found.kind, tone, basis: basis.slice(0, 3), source, ranToday };
}
