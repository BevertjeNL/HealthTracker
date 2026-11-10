import type { activities, healthMetrics } from "@/db/schema";
import { buildTrainingAdvice } from "./insights.ts";
import { buildRecoverySummary, dayDifference, isUsableRecoveryValue } from "./recovery.ts";
import { analyzePacing, buildRunDigest, classifyRun, compareToSimilar, KIND_LABEL, parseKmSplits, toAnalysisRun } from "./run-analysis.ts";
import { buildRunLesson } from "./run-lesson.ts";
import { assessPaceReserve, estimatePaceZones, prescribeNextRun, restDaysAfter } from "./run-prescription.ts";

type Activity = typeof activities.$inferSelect;
type Health = typeof healthMetrics.$inferSelect;
const DAY = 86_400_000;
const dateInAmsterdam = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const oneDecimal = (value: number) => value.toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const sumKm = (runs: Activity[]) => runs.reduce((sum, run) => sum + Math.max(0, run.distanceM ?? 0) / 1000, 0);

export function buildLoadPicture(runs: Activity[], now = new Date()) {
  const at = now.getTime();
  const thisWeek = runs.filter((run) => run.startDate.getTime() >= at - 7 * DAY && run.startDate.getTime() <= at);
  const priorWeeks = [1, 2, 3, 4].map((week) => runs.filter((run) => run.startDate.getTime() >= at - (week + 1) * 7 * DAY && run.startDate.getTime() < at - week * 7 * DAY));
  const weeklyKm = sumKm(thisWeek);
  const baselineKm = priorWeeks.filter((week) => week.length > 0).length >= 3 ? priorWeeks.reduce((sum, week) => sum + sumKm(week), 0) / 4 : null;
  const changePct = baselineKm && baselineKm >= 3 ? Math.round((weeklyKm / baselineKm - 1) * 100) : null;
  return { weeklyKm, baselineKm, changePct, runsThisWeek: thisWeek.length, weeksWithRuns: priorWeeks.filter((week) => week.length > 0).length };
}

export function buildCoachToday(runs: Activity[], health: Health[], now = new Date()) {
  const today = dateInAmsterdam(now);
  const sorted = [...runs].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const load = buildLoadPicture(sorted, now);
  const recovery = buildRecoverySummary(health, today);
  const latestHealthDate = health.map((row) => row.date).sort().at(-1) ?? null;
  const healthAgeDays = latestHealthDate ? dayDifference(today, latestHealthDate) : null;
  const advice = buildTrainingAdvice(sorted, recovery.score, load.changePct, now);
  const last = sorted[0] ?? null;
  const lastKind = last ? classifyRun(toAnalysisRun(last)) : null;
  const lastAgeDays = last ? dayDifference(today, dateInAmsterdam(last.startDate)) : null;
  const reason: string[] = [];
  if (last && lastAgeDays != null) reason.push(`Laatste run ${lastAgeDays === 0 ? "vandaag" : `${lastAgeDays} dag${lastAgeDays === 1 ? "" : "en"} geleden`} · ${oneDecimal((last.distanceM ?? 0) / 1000)} km ${lastKind ? KIND_LABEL[lastKind].toLowerCase() : ""}`);
  if (load.changePct != null) reason.push(`7 dagen ${oneDecimal(load.weeklyKm)} km · ${Math.abs(load.changePct)}% ${load.changePct >= 0 ? "boven" : "onder"} je 4-weekse basis`);
  else reason.push(`7 dagen ${oneDecimal(load.weeklyKm)} km · weekbasis wordt opgebouwd`);
  if (recovery.score != null) reason.push(`Herstel ${recovery.score}/100 op basis van ${recovery.scoredSignalCount} actuele signalen`);
  const analysisRuns = sorted.map(toAnalysisRun);
  const lastAnalysis = last ? toAnalysisRun(last) : null;
  const maxHr = analysisRuns.reduce((max, item) => Math.max(max, item.maxHr ?? 0), 0) || null;
  const lastPacing = lastAnalysis && lastKind ? analyzePacing(parseKmSplits(lastAnalysis.raw), lastKind, { maxHrObserved: maxHr }) : null;
  const prescription = prescribeNextRun({ runs: analysisRuns, now, daysSinceLast: lastAgeDays, readiness: recovery.score, loadChangePct: load.changePct, pacing: lastPacing });
  const prescribed = { label: prescription.title, detail: prescription.detail, coach: prescription.why, rhythm: advice.rhythm, kind: prescription.kind, distanceKm: prescription.distanceKm, paceSec: prescription.paceSec };
  return { today, advice: prescribed, recovery, load, latestHealthDate, healthAgeDays, reason, lastRun: last };
}

function healthSignal(rows: Health[], date: string, key: "hrvMs" | "restingHeartRate") {
  const before = rows.filter((row) => row.date < date && row.date >= shiftDate(date, -21) && isUsableRecoveryValue(key, row[key])).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const baseline = before.length >= 5 ? before.reduce((sum, row) => sum + row[key]!, 0) / before.length : null;
  const onDay = rows.find((row) => row.date === date && isUsableRecoveryValue(key, row[key]));
  const after = rows.filter((row) => row.date > date && row.date <= shiftDate(date, 2) && isUsableRecoveryValue(key, row[key])).sort((a, b) => a.date.localeCompare(b.date))[0];
  const deltaPct = baseline && after ? Math.round((after[key]! / baseline - 1) * 100) : null;
  return { baseline, baselineCount: before.length, onDay: onDay?.[key] ?? null, after: after?.[key] ?? null, afterDate: after?.date ?? null, deltaPct };
}
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

export function buildPostRunCoach(run: Activity, allRuns: Activity[], health: Health[]) {
  const analysisRun = toAnalysisRun(run);
  const kind = classifyRun(analysisRun);
  const runDate = dateInAmsterdam(run.startDate);
  const sorted = allRuns.map(toAnalysisRun);
  const digest = buildRunDigest(sorted).find((item) => item.id === run.id);
  const maxHr = sorted.reduce((max, item) => Math.max(max, item.maxHr ?? 0), 0) || null;
  const pacing = analyzePacing(parseKmSplits(analysisRun.raw), kind, { maxHrObserved: maxHr });
  const comparison = compareToSimilar(analysisRun, sorted);
  const hrv = healthSignal(health, runDate, "hrvMs");
  const restingHr = healthSignal(health, runDate, "restingHeartRate");
  const adverseHrv = hrv.deltaPct != null && hrv.deltaPct <= -10;
  const adverseRhr = restingHr.deltaPct != null && restingHr.deltaPct >= 5;
  const postSignalCount = Number(hrv.deltaPct != null) + Number(restingHr.deltaPct != null);
  const pairedSignals = postSignalCount === 2 && hrv.afterDate === restingHr.afterDate;
  const evidence: string[] = [];
  if (pacing) evidence.push(`Tweede helft ${Math.abs(Math.round(pacing.splitDiffSec))} sec/km ${pacing.splitDiffSec >= 0 ? "langzamer" : "sneller"} dan de eerste · ${pacing.unitCount} kilometers`);
  if (comparison?.paceDeltaSec != null) evidence.push(`${Math.abs(Math.round(comparison.paceDeltaSec))} sec/km ${comparison.paceDeltaSec <= 0 ? "sneller" : "langzamer"} dan ${comparison.count} vergelijkbare eerdere runs`);
  if (run.avgHeartRate != null) evidence.push(`Gemiddelde hartslag ${Math.round(run.avgHeartRate)} bpm`);
  if (hrv.deltaPct != null) evidence.push(`HRV na de run ${Math.abs(hrv.deltaPct)}% ${hrv.deltaPct >= 0 ? "boven" : "onder"} eigen basislijn`);
  if (restingHr.deltaPct != null) evidence.push(`Rusthartslag na de run ${Math.abs(restingHr.deltaPct)}% ${restingHr.deltaPct >= 0 ? "boven" : "onder"} eigen basislijn`);
  let recoveryTitle = "Laat deze training eerst landen";
  let recoveryText = "Maak de volgende loop rustig op praattempo. Een zware sessie direct na deze training levert geen betere voorbereiding op.";
  if (pairedSignals) {
    if (adverseHrv && adverseRhr) { recoveryTitle = "Herstel staat onder druk"; recoveryText = "HRV ligt lager en rusthartslag hoger dan je eigen basislijn. Plan eerst een rustige dag en kijk of beide waarden terugveren."; }
    else { recoveryTitle = "Geen dubbel herstelsignaal"; recoveryText = "HRV en rusthartslag wijzen niet allebei op extra belasting. Kijk ook naar vermoeidheid en spierpijn voordat je weer hard traint."; }
  } else if (postSignalCount === 2) { recoveryTitle = "Houd je volgende loop rustig"; recoveryText = "Je herstelmetingen zijn op verschillende dagen gedaan. Laat je volgende training daarom een rustige loop zijn en plan snelheid pas daarna."; }
  else if (postSignalCount === 1) { recoveryTitle = "Houd je volgende loop rustig"; recoveryText = "Na deze training is een rustige volgende loop de verstandige stap. Voeg pas weer tempo toe als je benen goed voelen."; }
  const bothAdverse = pairedSignals && adverseHrv && adverseRhr;
  // Evaluate the next run as of this run: only history up to the run, on the earliest day its type allows.
  const history = sorted.filter((item) => item.startDate.getTime() <= analysisRun.startDate.getTime());
  const offset = Math.max(1, restDaysAfter(analysisRun)) + (adverseHrv || adverseRhr ? 1 : 0);
  const nextDay = new Date(analysisRun.startDate.getTime() + offset * DAY);
  const reserve = assessPaceReserve(pacing, kind, run.avgHeartRate, maxHr);
  const next = prescribeNextRun({ runs: history, now: nextDay, daysSinceLast: offset, readiness: null, loadChangePct: null, pacing, zones: estimatePaceZones(history, nextDay) });
  const restDays = offset - 1;
  const lead = restDays >= 1 ? `Neem ${restDays === 1 ? "één rustdag" : `${restDays} rustdagen`}. ` : "";
  const nextStep = bothAdverse ? "Neem minstens één rustige dag. Loop pas weer stevig als je je hersteld voelt en de signalen normaliseren."
    : `${lead}${next.title}. ${next.detail}`;
  const healthAfterDate = [hrv.afterDate, restingHr.afterDate].filter((date): date is string => date != null).sort()[0] ?? null;
  const lesson = buildRunLesson(kind, digest, pacing, nextStep, reserve);
  return { kind, runDate, digest, pacing, reserve, comparison, lesson, hrv, restingHr, recoveryTitle, recoveryText, nextStep, evidence, healthAfterDate, hasHealthOnRunDay: hrv.onDay != null || restingHr.onDay != null };
}

export function postRunPlanWarning(review: ReturnType<typeof buildPostRunCoach>, runAt: Date) {
  if (!review.pacing) return null;
  if (review.pacing.pattern === "heavy-fade" || review.pacing.pattern === "fade") {
    return { at: runAt, reason: "Je laatste run verloor in de tweede helft tempo. Geef je volgende zware training pas ruimte na een rustige hersteldag." };
  }
  if (review.pacing.hrDriftPct != null && review.pacing.hrDriftPct >= 6 && review.kind !== "interval") {
    return { at: runAt, reason: "Je hartslag liep in de laatste run op bij vergelijkbaar tempo. Houd de eerstvolgende training rustig." };
  }
  return null;
}
