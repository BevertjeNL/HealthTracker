import type { activities, trainingGoals } from "@/db/schema";

export type TrainingGoal = Pick<typeof trainingGoals.$inferSelect, "distanceM" | "raceDate" | "targetPaceSecPerKm">;
type Activity = Pick<typeof activities.$inferSelect, "startDate" | "distanceM" | "movingTimeS" | "avgPaceMinPerKm" | "name">;
export type GoalContext = { recoveryScore: number | null; loadChangePct: number | null; generalAdvice: { label: string; detail: string; coach: string }; lastRunWarning?: { at: Date; reason: string } | null };
export type PlanDay = { date: string; title: string; detail: string; tone: "rest" | "easy" | "quality" | "long" | "race"; status: "planned" | "run-recorded" | "extra-run" | "adjusted"; actualKm: number | null };
export type GoalPlan = { daysUntilRace: number; finishTime: string; distanceLabel: string; targetPace: string; level: "basis opbouwen" | "afstand uitbreiden" | "gericht voorbereiden"; assessment: string; evidence: string[]; weeks: Array<{ label: string; days: PlanDay[] }>; raceDay: PlanDay; today: { label: string; detail: string; coach: string }; nextSession: PlanDay | null; last42LongestKm: number; runsPerWeek: number | null };

const DAY_MS = 86_400_000;
export const GOAL_DISTANCES = [{ meters: 5000, label: "5 kilometer" }, { meters: 10000, label: "10 kilometer" }, { meters: 21097, label: "Halve marathon" }] as const;
export const goalDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const dateMs = (date: string) => new Date(`${date}T12:00:00Z`).getTime();
export const addDays = (date: string, days: number) => new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (later: string, earlier: string) => Math.round((dateMs(later) - dateMs(earlier)) / DAY_MS);
export const paceText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export const finishText = (seconds: number) => { const total = Math.round(seconds); return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };
export const dateText = (date: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const km = (run: Activity) => Math.max(0, run.distanceM ?? 0) / 1000;
const roundHalf = (value: number) => Math.round(value * 2) / 2;
const dayOfWeek = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function parseGoalInput(distance: unknown, date: unknown, pace: unknown, today: string): { goal?: TrainingGoal; error?: string } {
  const meters = typeof distance === "string" && /^\d+$/.test(distance) ? Number(distance) : NaN;
  if (!GOAL_DISTANCES.some((option) => option.meters === meters)) return { error: "Kies een beschikbare wedstrijdafstand." };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dateMs(date)) || new Date(dateMs(date)).toISOString().slice(0, 10) !== date) return { error: "Kies een geldige wedstrijddatum." };
  const remaining = daysBetween(date, today);
  if (remaining < 1 || remaining > 365) return { error: "Kies een datum tussen morgen en een jaar vanaf vandaag." };
  const match = typeof pace === "string" ? pace.trim().match(/^(\d{1,2}):([0-5]\d)$/) : null;
  const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  if (!Number.isInteger(seconds) || seconds < 180 || seconds > 900) return { error: "Vul een doeltempo in als minuten:seconden per km, bijvoorbeeld 5:20." };
  return { goal: { distanceM: meters, raceDate: date, targetPaceSecPerKm: seconds } };
}

type SessionContext = { level: GoalPlan["level"]; longestKm: number; runsPerWeek: number | null; paceSupported: boolean; sustainedPace: boolean; qualityEligible: boolean; recentFullDistanceAt: string | null; trainingPaceSec: number };
function sessionForDate(date: string, raceDate: string, distanceM: number, paceSec: number, context: SessionContext): PlanDay {
  const until = daysBetween(raceDate, date);
  const weekday = dayOfWeek(date);
  const pace = paceText(paceSec);
  const trainingPace = paceText(context.trainingPaceSec);
  const distanceKm = distanceM / 1000;
  const maxLong = distanceKm >= 20 ? 18 : distanceKm >= 9 ? 13 : 10;
  const hasBase = context.level !== "basis opbouwen";
  const ready = context.level === "gericht voorbereiden";
  const recentRaceRecovery = context.recentFullDistanceAt != null && daysBetween(date, context.recentFullDistanceAt) <= 10 && daysBetween(date, context.recentFullDistanceAt) >= 0;
  const baseLongKm = roundHalf(Math.min(maxLong, Math.max(4, context.longestKm + (until >= 22 ? 1 : 1.5))));
  const longKm = recentRaceRecovery ? roundHalf(Math.min(baseLongKm, distanceKm >= 20 ? 12 : distanceKm * .65)) : baseLongKm;
  const rest: PlanDay = { date, title: "Herstel", detail: "Rust of wandelen. Sla een gemiste training over; haal haar niet dubbel in.", tone: "rest", status: "planned", actualKm: null };
  if (until === 0) return { date, title: GOAL_DISTANCES.find((item) => item.meters === distanceM)?.label ?? "Wedstrijd", detail: `Start de eerste kilometers circa 5–10 s/km rustiger dan ${pace}/km. Zoek daarna je doeltempo als het gecontroleerd voelt.`, tone: "race", status: "planned", actualKm: null };
  if (until <= 7) {
    if (until === 6) return { date, title: "Rustig loslopen", detail: "30–35 min op praattempo. Houd de benen fris.", tone: "easy", status: "planned", actualKm: null };
    if (until === 4 && context.qualityEligible) return { date, title: "Korte doeltempo-prikkel", detail: `10 min rustig inlopen · 2 × 4 min rond ${trainingPace}/km met 3 min heel rustig dribbelen · 10 min uitlopen. Je moet na elk blok nog een blok kunnen doen.`, tone: "quality", status: "planned", actualKm: null };
    if (until === 2) return { date, title: "Optioneel losmaken", detail: "15–20 min heel rustig of volledige rust als je beter herstelt.", tone: "easy", status: "planned", actualKm: null };
    return rest;
  }
  if (weekday === 0) {
    if (until <= 14) return { date, title: "Kortere lange duur", detail: `${roundHalf(Math.min(longKm, Math.max(6, context.longestKm * .7), distanceKm >= 20 ? 12 : 9))} km rustig: je kunt volledige zinnen spreken. De omvang neemt nu af richting je race.`, tone: "long", status: "planned", actualKm: null };
    return { date, title: recentRaceRecovery ? "Herstellende lange duur" : "Lange duurloop", detail: `${longKm} km rustig: je kunt volledige zinnen spreken. ${recentRaceRecovery ? "Je liep kort geleden al ongeveer de wedstrijdafstand; voeg nu geen tweede zware lange loop toe." : "Loop het laatste deel niet sneller om een doeltempo te bewijzen."}`, tone: "long", status: "planned", actualKm: null };
  }
  if (weekday === 2) return { date, title: context.runsPerWeek != null && context.runsPerWeek < 2 ? "Optionele rustige loop" : "Rustige duurloop", detail: `${ready && (context.runsPerWeek ?? 0) >= 2 ? "40–50" : "25–35"} min op praattempo: je kunt volledige zinnen spreken. ${context.runsPerWeek != null && context.runsPerWeek < 2 ? "Sla deze extra loop over als drie trainingen deze week te veel zijn." : "Bewaar je snelheid voor de tempotraining."}`, tone: "easy", status: "planned", actualKm: null };
  if (weekday === 4) {
    if (!context.qualityEligible) return { date, title: "Rustig basiswerk", detail: "30–35 min op praattempo. Eindig met 4 × 20 seconden vlot maar ontspannen, telkens met 1 minuut wandelen of dribbelen.", tone: "easy", status: "planned", actualKm: null };
    if (recentRaceRecovery) return { date, title: "Soepel tempo hervatten", detail: "10 min rustig inlopen · 4 × 3 min vlot maar ontspannen, met 3 min rustig dribbelen · 10 min uitlopen. Dit is geen test of wedstrijd.", tone: "quality", status: "planned", actualKm: null };
    if (!hasBase) return { date, title: "Korte tempoblokken", detail: "10 min rustig inlopen · 6 × 1 min stevig maar ontspannen, met 2 min wandelen of dribbelen · 10 min uitlopen. Houd elke herhaling even vlot.", tone: "quality", status: "planned", actualKm: null };
    if (until <= 14) return { date, title: "Beheerst tempogevoel", detail: `10 min rustig inlopen · 2 × 6 min rond ${trainingPace}/km met 3 min heel rustig dribbelen · 10 min uitlopen.`, tone: "quality", status: "planned", actualKm: null };
    return { date, title: context.paceSupported && context.sustainedPace && ready ? "Doeltempo oefenen" : "Doeltempo verkennen", detail: context.paceSupported && context.sustainedPace && ready ? `12 min rustig inlopen · 3 × 8 min rond ${trainingPace}/km met 3 min dribbelen · 10 min uitlopen. Houd het laatste blok even sterk als het eerste.` : context.paceSupported ? `10 min rustig inlopen · 2 × 8 min rond ${trainingPace}/km met 3 min dribbelen · 10 min uitlopen. Houd het tweede blok even sterk als het eerste.` : `10 min rustig inlopen · 2 × 6 min stevig maar controleerbaar, met 3 min dribbelen · 10 min uitlopen. ${pace}/km is nu geen verplichting.`, tone: "quality", status: "planned", actualKm: null };
  }
  if (weekday === 6 && ready && context.runsPerWeek != null && context.runsPerWeek >= 3.5 && until > 14) return { date, title: "Optionele herstelrun", detail: "20–30 min zeer rustig. Laat weg als je benen zwaar zijn.", tone: "easy", status: "planned", actualKm: null };
  return rest;
}

export function buildGoalPlan(goal: TrainingGoal, runs: Activity[], context: GoalContext, now = new Date()): GoalPlan {
  const today = goalDate(now);
  const daysUntilRace = daysBetween(goal.raceDate, today);
  const recent = runs.filter((run) => run.startDate.getTime() <= now.getTime() && run.startDate.getTime() >= now.getTime() - 42 * DAY_MS);
  const last42LongestKm = recent.reduce((max, run) => Math.max(max, km(run)), 0);
  const runsPerWeek = recent.length >= 3 ? recent.length / 6 : null;
  const distanceKm = goal.distanceM / 1000;
  const paceEvidenceCount = recent.filter((run) => km(run) >= distanceKm * .45 && run.avgPaceMinPerKm != null && run.avgPaceMinPerKm * 60 <= goal.targetPaceSecPerKm + 15).length;
  const recentFullDistance = [...recent].filter((run) => km(run) >= distanceKm * .9 && run.avgPaceMinPerKm != null).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null;
  const fullDistancePace = recentFullDistance?.avgPaceMinPerKm == null ? null : Math.round(recentFullDistance.avgPaceMinPerKm * 60);
  const sustainedPace = paceEvidenceCount >= 3;
  const paceSupported = sustainedPace || fullDistancePace != null && fullDistancePace <= goal.targetPaceSecPerKm + 15;
  const baseLong = distanceKm >= 20 ? 14 : distanceKm >= 9 ? 9 : 6;
  const moderateLong = distanceKm >= 20 ? 8 : distanceKm >= 9 ? 6 : 4;
  const level: GoalPlan["level"] = recent.length >= 3 && last42LongestKm >= distanceKm * .9 || runsPerWeek != null && runsPerWeek >= 2.5 && last42LongestKm >= baseLong ? "gericht voorbereiden" : recent.length >= 3 && last42LongestKm >= moderateLong ? "afstand uitbreiden" : "basis opbouwen";
  const qualityEligible = recent.length >= 3 && last42LongestKm >= moderateLong;
  const trainingPaceSec = Math.max(goal.targetPaceSecPerKm, fullDistancePace ?? goal.targetPaceSecPerKm);
  const recentPacingWarning = context.lastRunWarning && daysBetween(today, goalDate(context.lastRunWarning.at)) >= 0 && daysBetween(today, goalDate(context.lastRunWarning.at)) <= 14 ? context.lastRunWarning : null;
  const baseAssessment = recentFullDistance ? "Je hebt de wedstrijdafstand recent gelopen. Meer afstand bewijzen is nu niet je prioriteit: oefen één keer per week een gelijkmatig tempo en herstel goed tussen de sessies." : level === "gericht voorbereiden" ? "Je recente duurloop en regelmaat geven ruimte voor één gerichte tempotraining per week naast een rustige lange loop." : level === "afstand uitbreiden" ? "Je kunt een gecontroleerde tempotraining per week doen. Bouw de lange loop stapsgewijs op en maak de extra rustige loop optioneel." : "Bouw eerst loopritme en afstand op. Korte vlotte stukjes mogen, maar een lang blok op wedstrijdtempo is nu geen goed idee.";
  const assessment = `${baseAssessment} ${recentPacingWarning ? "Je laatste loop liet tempoverlies zien: oefen een rustigere start en maak het laatste tempoblok even sterk als het eerste." : paceSupported ? `Gebruik ongeveer ${paceText(trainingPaceSec)}/km als startpunt voor korte tempoblokken, niet als plicht voor elke training.` : "Loop tempoblokken op gevoel: stevig maar controleerbaar, zodat het laatste blok even goed gaat als het eerste."}`;
  const evidence = [recent.length >= 3 ? `${(recent.length / 6).toFixed(1).replace(".", ",")} runs per week in de laatste 6 weken` : "Je schema begint met twee vaste loopmomenten per week", `Langste run in 6 weken: ${last42LongestKm.toFixed(1).replace(".", ",")} km`, recentPacingWarning ? "Tempoverlies in de laatste loop: start de tempoblokken rustiger" : recentFullDistance ? "De wedstrijdafstand is al recent gelopen; focus op tempovastheid" : sustainedPace ? "Drie langere runs ondersteunen korte blokken rond het doeltempo" : "Tempoblokken worden op inspanning gestuurd", context.recoveryScore == null ? "Herstel: houd zware en rustige dagen gescheiden" : `Herstel ${context.recoveryScore}/100`, context.loadChangePct == null ? "Weekbelasting: verhoog de omvang niet om trainingen in te halen" : `Laatste 7 dagen ${Math.abs(context.loadChangePct)}% ${context.loadChangePct >= 0 ? "boven" : "onder"} je basis`];
  const sessionContext: SessionContext = { level, longestKm: last42LongestKm, runsPerWeek, paceSupported, sustainedPace, qualityEligible, recentFullDistanceAt: recentFullDistance ? goalDate(recentFullDistance.startDate) : null, trainingPaceSec };
  const allDays: PlanDay[] = [];
  const previewDays = Math.min(28, Math.max(0, daysUntilRace));
  const runDates = new Map<string, Activity[]>();
  for (const run of runs) { const date = goalDate(run.startDate); runDates.set(date, [...(runDates.get(date) ?? []), run]); }
  for (let offset = 0; offset < previewDays; offset++) {
    const date = addDays(today, offset);
    const day = sessionForDate(date, goal.raceDate, goal.distanceM, goal.targetPaceSecPerKm, sessionContext);
    const actual = runDates.get(date);
    if (actual?.length) { day.status = day.tone === "rest" ? "extra-run" : "run-recorded"; day.actualKm = roundHalf(actual.reduce((sum, run) => sum + km(run), 0)); }
    allDays.push(day);
  }
  const raceDay = sessionForDate(goal.raceDate, goal.raceDate, goal.distanceM, goal.targetPaceSecPerKm, sessionContext);
  const raceActual = runDates.get(goal.raceDate);
  if (raceActual?.length) { raceDay.status = "run-recorded"; raceDay.actualKm = roundHalf(raceActual.reduce((sum, run) => sum + km(run), 0)); }
  const todayDay = allDays[0];
  const general = context.generalAdvice;
  const recoveryOverride = context.recoveryScore != null && context.recoveryScore < 58 || context.loadChangePct != null && context.loadChangePct > 30;
  const lastRunAge = recent.length ? daysBetween(today, goalDate([...recent].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0].startDate)) : null;
  const generalRest = lastRunAge != null && lastRunAge <= 1 && /niet nogmaals|rustdag|geen looptraining|herstel boven/i.test(general.label);
  const recentRunWarning = context.lastRunWarning && daysBetween(today, goalDate(context.lastRunWarning.at)) <= 2 && daysBetween(today, goalDate(context.lastRunWarning.at)) >= 0 ? context.lastRunWarning : null;
  let todayAdvice: GoalPlan["today"];
  if (daysUntilRace < 0) todayAdvice = { label: "Stel een nieuw doel in", detail: "Je wedstrijddatum is voorbij.", coach: "Werk je doel bij om een nieuw schema te krijgen." };
  else if (daysUntilRace === 0) todayAdvice = { label: "Wedstrijddag", detail: raceDay.detail, coach: "Je schema is afgerond. Stem het tempo af op hoe je je vandaag voelt." };
  else if (todayDay?.status === "run-recorded" || todayDay?.status === "extra-run") todayAdvice = { label: "Vandaag herstellen", detail: "Je hebt vandaag al gelopen. Wandelen is optioneel.", coach: "De run staat in je schema. De volgende training wordt getoond zodra je hersteld bent." };
  else if (generalRest || ((recoveryOverride || recentRunWarning) && (todayDay?.tone === "quality" || todayDay?.tone === "long"))) {
    todayAdvice = { label: "Herstel krijgt voorrang", detail: generalRest ? general.detail : "Rust of 20–30 min heel rustig wandelen", coach: `${recentRunWarning?.reason ?? general.coach} De geplande zware sessie schuift niet automatisch naar morgen.` };
    if (todayDay && todayDay.tone !== "rest") { todayDay.status = "adjusted"; todayDay.title = "Aangepast: herstel"; todayDay.detail = todayAdvice.detail; todayDay.tone = "rest"; }
  } else if (todayDay?.tone === "rest") todayAdvice = { label: "Vandaag herstel", detail: todayDay.detail, coach: "Deze rustdag is onderdeel van je schema richting de wedstrijd." };
  else todayAdvice = { label: todayDay.title, detail: todayDay.detail, coach: todayDay.tone === "quality" ? "Houd de eerste herhaling gecontroleerd. De laatste moet even goed gaan; zo train je tempo zonder jezelf leeg te lopen." : todayDay.tone === "long" ? "Loop op een tempo waarop je volledige zinnen kunt spreken. De lange loop traint volhouden, niet racen." : "Dit is een rustige training die je klaar maakt voor de volgende tempoprikkel." };
  const nextSession = allDays.find((day) => day.date > today && day.tone !== "rest" && day.status === "planned") ?? (daysUntilRace >= 0 ? raceDay : null);
  const weeks = Array.from({ length: Math.ceil(allDays.length / 7) }, (_, index) => ({ label: `Week ${index + 1}`, days: allDays.slice(index * 7, index * 7 + 7) }));
  return { daysUntilRace, finishTime: finishText(goal.targetPaceSecPerKm * distanceKm), distanceLabel: GOAL_DISTANCES.find((item) => item.meters === goal.distanceM)?.label ?? `${distanceKm.toFixed(1)} km`, targetPace: paceText(goal.targetPaceSecPerKm), level, assessment, evidence, weeks, raceDay, today: todayAdvice, nextSession, last42LongestKm, runsPerWeek };
}
