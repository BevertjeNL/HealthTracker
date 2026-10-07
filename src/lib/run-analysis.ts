import type { activities } from "@/db/schema";

// Rule-based run analysis: classification (training vs race), per-km/per-lap pacing,
// training-vs-race comparison, form trends and race predictions.
// Pure functions only, so everything is testable with `node --test`.
// Every aggregate/trend needs at least MIN_SAMPLES data points (see CLAUDE.md).

type Activity = typeof activities.$inferSelect;

export const MIN_SAMPLES = 3;
const DAY_MS = 86_400_000;

export type RunKind = "easy" | "long" | "interval" | "race";
export const KIND_LABEL: Record<RunKind, string> = { easy: "Rustig", long: "Lange duur", interval: "Interval / tempo", race: "Wedstrijd" };

export type AnalysisRun = {
  id: number;
  name: string;
  startDate: Date;
  distanceM: number;
  movingTimeS: number;
  paceMinPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  cadenceSpm: number | null;
  sufferScore: number | null;
  workoutType: number | null;
  kindOverride: string | null;
  raw: Record<string, unknown>;
};

export function toAnalysisRun(row: Activity): AnalysisRun {
  const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? (row.raw as Record<string, unknown>) : {};
  const distanceM = Math.max(0, row.distanceM ?? 0);
  const movingTimeS = Math.max(0, row.movingTimeS ?? 0);
  return {
    id: row.id,
    name: row.name || "Run",
    startDate: row.startDate,
    distanceM,
    movingTimeS,
    paceMinPerKm: row.avgPaceMinPerKm ?? (distanceM > 0 && movingTimeS > 0 ? movingTimeS / 60 / (distanceM / 1000) : null),
    avgHr: row.avgHeartRate,
    maxHr: row.maxHeartRate,
    elevationM: row.elevationGainM,
    cadenceSpm: row.avgCadence ? row.avgCadence * 2 : null, // Strava reports steps per leg
    sufferScore: row.sufferScore,
    workoutType: typeof raw.workout_type === "number" ? raw.workout_type : null,
    kindOverride: row.kindOverride,
    raw,
  };
}

/* ---------- classification ---------- */

export type KindOverride = "race" | "not_race";
type KindInput = { name?: string | null; workoutType?: number | null; distanceM?: number | null; kindOverride?: string | null };

const RACE_NAME = /wedstrijd|\brace\b|parkrun|marathon|\b(5|10)\s?k\b|\b(5|10)\s?km\s+(loop|run)\b|loop\s+\d+\s?km\s+wedstrijd/i;
const NOT_RACE_NAME = /training|pace|tempo|rustig|herstel|easy|warming|cooling|simulat|voorbereiding/i;

// Strava workout_type for runs: 0 default, 1 race, 2 long run, 3 workout.
export function classifyRun(run: KindInput): RunKind {
  const name = (run.name ?? "").toLowerCase();
  if (run.kindOverride === "race") return "race";
  if (run.kindOverride !== "not_race") {
    if (run.workoutType === 1) return "race";
    if (RACE_NAME.test(name) && !NOT_RACE_NAME.test(name)) return "race";
  }
  if (run.workoutType === 3 || /interval|tempo|fartlek|threshold|drempel|repetition|heuvel/.test(name)) return "interval";
  if (run.workoutType === 2 || /lange|long run|duurloop lang/.test(name) || (run.distanceM ?? 0) >= 14000) return "long";
  return "easy";
}

export const isRace = (run: KindInput) => classifyRun(run) === "race";

const DISTANCE_BANDS = [
  { key: "5k", label: "5 km", m: 5000, min: 4700, max: 5500 },
  { key: "10k", label: "10 km", m: 10000, min: 9600, max: 10900 },
  { key: "10em", label: "10 mijl", m: 16093, min: 15600, max: 16900 },
  { key: "half", label: "Halve marathon", m: 21097.5, min: 20600, max: 22200 },
  { key: "marathon", label: "Marathon", m: 42195, min: 41500, max: 44000 },
] as const;

export function distanceBand(distanceM: number) {
  return DISTANCE_BANDS.find((band) => distanceM >= band.min && distanceM <= band.max) ?? null;
}

/* ---------- helpers ---------- */

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const stdev = (values: number[]) => {
  const avg = mean(values);
  if (avg == null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
};
const round = (value: number, digits = 0) => { const factor = 10 ** digits; return Math.round(value * factor) / factor; };

export function formatPaceSec(secPerKm: number | null) {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "–";
  let min = Math.floor(secPerKm / 60);
  let sec = Math.round(secPerKm - min * 60);
  if (sec === 60) { min += 1; sec = 0; }
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function formatTime(totalS: number) {
  const rounded = Math.round(totalS);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const runPaceSec = (run: AnalysisRun) => (run.paceMinPerKm && run.paceMinPerKm > 2 ? run.paceMinPerKm * 60 : null);

export type Tone = "good" | "watch" | "action" | "info";
export type Advice = { tone: Tone; title: string; detail: string };

/* ---------- splits and laps ---------- */

export type PaceUnit = {
  index: number;
  label: string;
  distanceM: number;
  timeS: number;
  hr: number | null;
  elevM: number;
  gapSpeed: number | null; // grade adjusted speed in m/s, when Strava provides it
  cadenceSpm: number | null;
  watts: number | null;
  partial: boolean;
};

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const objects = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : []);

export function parseKmSplits(raw: Record<string, unknown>): PaceUnit[] {
  return objects(raw.splits_metric).flatMap((split, position) => {
    const distance = num(split.distance);
    const time = num(split.moving_time);
    if (!distance || !time || distance <= 0 || time <= 0) return [];
    const index = num(split.split) ?? position + 1;
    return [{ index, label: String(index), distanceM: distance, timeS: time, hr: num(split.average_heartrate), elevM: num(split.elevation_difference) ?? 0, gapSpeed: num(split.average_grade_adjusted_speed), cadenceSpm: null, watts: null, partial: distance < 900 }];
  });
}

export function parseLaps(raw: Record<string, unknown>): PaceUnit[] {
  return objects(raw.laps).flatMap((lap, position) => {
    const distance = num(lap.distance);
    const time = num(lap.moving_time);
    if (!distance || !time || distance < 50 || time <= 0) return [];
    const index = num(lap.lap_index) ?? position + 1;
    const cadence = num(lap.average_cadence);
    return [{ index, label: String(index), distanceM: distance, timeS: time, hr: num(lap.average_heartrate), elevM: num(lap.total_elevation_gain) ?? 0, gapSpeed: null, cadenceSpm: cadence ? cadence * 2 : null, watts: num(lap.average_watts), partial: false }];
  });
}

// Auto-laps of exactly 1 km duplicate the splits, so only offer laps when the athlete or device made real laps.
export function lapsAreDistinct(laps: PaceUnit[], splits: PaceUnit[]) {
  if (laps.length < 2) return false;
  if (laps.length === splits.length && laps.every((lap) => Math.abs(lap.distanceM - 1000) < 60 || lap.distanceM < 1000)) return false;
  return true;
}

/* ---------- pacing analysis of one run ---------- */

export type PacingPattern = "negative" | "even" | "fade" | "heavy-fade" | "variable" | "intervals";
export const PATTERN_LABEL: Record<PacingPattern, string> = {
  negative: "Negatieve split",
  even: "Gelijkmatig",
  fade: "Licht vervallen",
  "heavy-fade": "Sterk vervallen",
  variable: "Wisselend tempo",
  intervals: "Interval-opbouw",
};

export type UnitRow = { label: string; distanceM: number; paceSec: number; gapPaceSec: number | null; deltaSec: number | null; hr: number | null; elevM: number; cadenceSpm: number | null; watts: number | null; note: string | null; tone: Tone };

export type PacingAnalysis = {
  unitCount: number;
  avgPaceSec: number;
  firstHalfPaceSec: number;
  secondHalfPaceSec: number;
  splitDiffSec: number; // positive = second half slower
  cvPct: number | null;
  firstUnitDeltaSec: number | null; // first unit vs average of the rest (negative = faster start)
  lastUnitDeltaSec: number | null;
  hrDriftPct: number | null;
  decouplingPct: number | null;
  gradeAdjusted: boolean;
  pattern: PacingPattern;
  fastest: { label: string; paceSec: number };
  slowest: { label: string; paceSec: number };
  rows: UnitRow[];
  advice: Advice[];
};

export type AnalysisContext = { maxHrObserved?: number | null; unitName?: "kilometer" | "ronde" };

const effortPaceSec = (unit: PaceUnit, useGap: boolean) => (useGap && unit.gapSpeed ? 1000 / unit.gapSpeed : unit.timeS / (unit.distanceM / 1000));

export function analyzePacing(units: PaceUnit[], kind: RunKind, context: AnalysisContext = {}): PacingAnalysis | null {
  const full = units.filter((unit) => !unit.partial && unit.distanceM > 0);
  if (full.length < MIN_SAMPLES) return null;
  const unitName = context.unitName ?? "kilometer";
  const useGap = full.every((unit) => unit.gapSpeed != null);
  const paces = full.map((unit) => effortPaceSec(unit, useGap));
  const avgPaceSec = (full.reduce((sum, unit) => sum + unit.timeS, 0) / (full.reduce((sum, unit) => sum + unit.distanceM, 0) / 1000));

  // halves by distance
  const totalDistance = units.reduce((sum, unit) => sum + unit.distanceM, 0);
  let cumulative = 0;
  const firstHalf: PaceUnit[] = [];
  const secondHalf: PaceUnit[] = [];
  for (const unit of units) {
    const midpoint = cumulative + unit.distanceM / 2;
    (midpoint <= totalDistance / 2 ? firstHalf : secondHalf).push(unit);
    cumulative += unit.distanceM;
  }
  const halfPace = (list: PaceUnit[]) => {
    const dist = list.reduce((sum, unit) => sum + unit.distanceM, 0);
    const time = list.reduce((sum, unit) => sum + (useGap && unit.gapSpeed ? unit.distanceM / unit.gapSpeed : unit.timeS), 0);
    return dist > 0 ? time / (dist / 1000) : avgPaceSec;
  };
  const firstHalfPaceSec = halfPace(firstHalf);
  const secondHalfPaceSec = halfPace(secondHalf);
  const splitDiffSec = secondHalfPaceSec - firstHalfPaceSec;

  const paceMean = mean(paces)!;
  const sd = stdev(paces);
  const cvPct = sd != null ? (sd / paceMean) * 100 : null;
  const restMean = mean(paces.slice(1));
  const firstUnitDeltaSec = restMean != null ? paces[0] - restMean : null;
  const lastUnitDeltaSec = paces.length >= 4 ? paces.at(-1)! - mean(paces.slice(0, -1))! : null;

  // heart rate drift and aerobic decoupling (pace:HR efficiency, first vs second half)
  const withHr = (list: PaceUnit[]) => list.filter((unit) => unit.hr != null);
  const hrFirst = withHr(firstHalf);
  const hrSecond = withHr(secondHalf);
  const enoughHr = withHr(full).length >= full.length * 0.8 && hrFirst.length >= 2 && hrSecond.length >= 2;
  const avgHr = (list: PaceUnit[]) => mean(list.map((unit) => unit.hr!))!;
  const speedOf = (list: PaceUnit[]) => list.reduce((sum, unit) => sum + unit.distanceM, 0) / list.reduce((sum, unit) => sum + unit.timeS, 0);
  const hrDriftPct = enoughHr ? ((avgHr(hrSecond) - avgHr(hrFirst)) / avgHr(hrFirst)) * 100 : null;
  const decouplingPct = enoughHr ? ((speedOf(hrFirst) / avgHr(hrFirst) - speedOf(hrSecond) / avgHr(hrSecond)) / (speedOf(hrFirst) / avgHr(hrFirst))) * 100 : null;

  // pattern
  let pattern: PacingPattern;
  const fastBlocks = paces.filter((pace) => pace <= paceMean - 20).length;
  const slowBlocks = paces.filter((pace) => pace >= paceMean + 20).length;
  if (kind === "interval" && fastBlocks >= 2 && slowBlocks >= 2) pattern = "intervals";
  else if (cvPct != null && cvPct > 7 && kind !== "interval") pattern = "variable";
  else if (splitDiffSec <= -4) pattern = "negative";
  else if (splitDiffSec >= 15) pattern = "heavy-fade";
  else if (splitDiffSec >= 5) pattern = "fade";
  else pattern = "even";

  // per-unit rows with a short coaching note
  const rows: UnitRow[] = units.map((unit) => {
    const paceSec = unit.timeS / (unit.distanceM / 1000);
    if (unit.partial) return { label: unit.label, distanceM: unit.distanceM, paceSec, gapPaceSec: unit.gapSpeed ? 1000 / unit.gapSpeed : null, deltaSec: null, hr: unit.hr, elevM: unit.elevM, cadenceSpm: unit.cadenceSpm, watts: unit.watts, note: null, tone: "info" as Tone };
    const position = full.indexOf(unit);
    const effort = paces[position];
    const delta = effort - avgPaceSec;
    const climbing = unit.elevM >= 8 && !useGap;
    const descending = unit.elevM <= -8 && !useGap;
    const lastThird = position >= Math.floor(full.length * 2 / 3);
    let note: string | null = null;
    let tone: Tone = "info";
    if (pattern === "intervals") {
      if (delta <= -20) { note = "Snel blok"; tone = "good"; }
      else if (delta >= 20) { note = "Herstel"; tone = "info"; }
    } else if (position === 0 && firstUnitDeltaSec != null && firstUnitDeltaSec <= -10) { note = `Te snel gestart (${Math.abs(round(firstUnitDeltaSec))} s sneller dan de rest)`; tone = "watch"; }
    else if (climbing && delta >= 5) { note = "Klim: tempoverlies hoort hierbij"; tone = "info"; }
    else if (descending && delta <= -5) { note = "Afdaling: tempo meegenomen"; tone = "info"; }
    else if (delta >= 15) { note = lastThird ? "Vermoeid: inzakken in het laatste deel" : "Inzinking"; tone = "watch"; }
    else if (delta <= -10 && position === full.length - 1) { note = "Sterke afsluiting"; tone = "good"; }
    else if (Math.abs(delta) <= 4) { note = "Op koers"; tone = "good"; }
    return { label: unit.label, distanceM: unit.distanceM, paceSec, gapPaceSec: unit.gapSpeed ? 1000 / unit.gapSpeed : null, deltaSec: round(delta, 1), hr: unit.hr, elevM: unit.elevM, cadenceSpm: unit.cadenceSpm, watts: unit.watts, note, tone };
  });

  const fastestIndex = paces.indexOf(Math.min(...paces));
  const slowestIndex = paces.indexOf(Math.max(...paces));
  const analysis: PacingAnalysis = {
    unitCount: full.length, avgPaceSec, firstHalfPaceSec, secondHalfPaceSec, splitDiffSec, cvPct, firstUnitDeltaSec, lastUnitDeltaSec, hrDriftPct, decouplingPct, gradeAdjusted: useGap, pattern,
    fastest: { label: full[fastestIndex].label, paceSec: full[fastestIndex].timeS / (full[fastestIndex].distanceM / 1000) },
    slowest: { label: full[slowestIndex].label, paceSec: full[slowestIndex].timeS / (full[slowestIndex].distanceM / 1000) },
    rows, advice: [],
  };
  analysis.advice = buildPacingAdvice(analysis, kind, unitName, full);
  return analysis;
}

function buildPacingAdvice(a: PacingAnalysis, kind: RunKind, unitName: string, full: PaceUnit[]): Advice[] {
  const advice: Advice[] = [];
  const fade = Math.round(a.splitDiffSec);
  const start = a.firstUnitDeltaSec != null ? Math.round(a.firstUnitDeltaSec) : null;

  if (a.pattern === "intervals") {
    const fast = full.filter((unit) => unit.timeS / (unit.distanceM / 1000) <= a.avgPaceSec - 20);
    const fastPaces = fast.map((unit) => unit.timeS / (unit.distanceM / 1000));
    const spread = fastPaces.length >= MIN_SAMPLES ? Math.max(...fastPaces) - Math.min(...fastPaces) : null;
    const trend = fastPaces.length >= MIN_SAMPLES ? fastPaces.at(-1)! - fastPaces[0] : null;
    if (spread != null && trend != null) {
      if (trend >= 8) advice.push({ tone: "watch", title: "Je laatste snelle blok was het zwakst", detail: `Het laatste snelle blok liep ${Math.round(trend)} s/km langzamer dan het eerste. Begin de eerste herhaling iets rustiger, zodat je de reeks gelijkmatig kunt uitlopen.` });
      else if (spread <= 10) advice.push({ tone: "good", title: "Gelijkmatige snelle blokken", detail: `Je snelle blokken liggen binnen ${Math.round(spread)} s/km van elkaar. Dat is een beheerste, goed gedoseerde training.` });
      else advice.push({ tone: "info", title: "Snelle blokken liepen uiteen", detail: `Tussen je snelste en langzaamste snelle blok zit ${Math.round(spread)} s/km. Kies een vast doeltempo en bewaak dat bij de eerste herhaling.` });
    } else advice.push({ tone: "info", title: "Interval-opbouw herkend", detail: "Er zijn te weinig snelle blokken om ze onderling te vergelijken." });
    return advice;
  }

  if (kind === "race") {
    if (start != null && start <= -10) advice.push({ tone: "action", title: "Te snel weggelopen", detail: `Je eerste ${unitName} lag ${Math.abs(start)} s/km onder het tempo van de rest. Plan de eerste twee ${unitName === "ronde" ? "rondes" : "kilometers"} bewust 5–10 s/km boven je doeltempo en versnel pas na het eerste derde.` });
    if (a.pattern === "heavy-fade" || a.pattern === "fade") advice.push({ tone: a.pattern === "heavy-fade" ? "action" : "watch", title: `Tweede helft ${fade} s/km langzamer`, detail: a.pattern === "heavy-fade" ? "Dit verlies kost je meer dan de snelle start oplevert. Train met lange tempoblokken op wedstrijdtempo (bijvoorbeeld 2 × 15 minuten) en kies een tempo dat je helft twee kunt vasthouden." : "Een klein verval is normaal, maar je kunt tijd winnen met een tempo dat de eerste helft iets lager ligt." });
    if (a.pattern === "negative") advice.push({ tone: "good", title: "Sterk verdeeld", detail: `Je tweede helft was ${Math.abs(fade)} s/km sneller. Je hebt je krachten goed ingedeeld.` });
    if (a.pattern === "even") advice.push({ tone: "good", title: "Gelijkmatig tempo", detail: "Eerste en tweede helft liggen dicht bij elkaar. Dit is het ideale wedstrijdpatroon." });
    if (a.pattern === "variable") advice.push({ tone: "watch", title: "Wisselend wedstrijdtempo", detail: `Je tempo schommelde sterk (${a.cvPct?.toFixed(1)}% spreiding). Oefen met een vast tempo op een vlakke route en kijk vooral op de rondetijd, niet op de snelheid.` });
    if (a.lastUnitDeltaSec != null && a.lastUnitDeltaSec <= -10 && a.splitDiffSec < 5) advice.push({ tone: "info", title: "Je had nog een eindsprint in je benen", detail: `De laatste ${unitName} was ${Math.abs(Math.round(a.lastUnitDeltaSec))} s/km sneller dan je gemiddelde. Je kunt dus wat eerder wat meer risico nemen.` });
    if (a.decouplingPct != null && a.decouplingPct > 6) advice.push({ tone: "watch", title: "Hartslag liep op bij gelijk tempo", detail: `Je efficiëntie (tempo per hartslag) daalde ${a.decouplingPct.toFixed(0)}% in de tweede helft. Dat wijst op een te hoog tempo vanaf het begin of onvoldoende uithoudingsvermogen op deze afstand.` });
    return advice.slice(0, 4);
  }

  if (kind === "long") {
    if (a.pattern === "heavy-fade" || a.pattern === "fade") advice.push({ tone: a.pattern === "heavy-fade" ? "action" : "watch", title: `Je liep ${fade} s/km langzamer in de tweede helft`, detail: "Een lange duurloop is het beste als de tweede helft even snel of iets sneller is. Begin 10–15 s/km rustiger en eet of drink vanaf ongeveer 45 minuten." });
    if (a.pattern === "negative" || a.pattern === "even") advice.push({ tone: "good", title: "Lange duur goed verdeeld", detail: a.pattern === "negative" ? `Je liep de tweede helft ${Math.abs(fade)} s/km sneller. Je hebt rustig opgebouwd.` : "Je hield je tempo stabiel over de hele afstand." });
    if (a.decouplingPct != null) {
      if (a.decouplingPct <= 5) advice.push({ tone: "good", title: "Aerobe basis houdt stand", detail: `Je efficiëntie daalde slechts ${Math.max(0, a.decouplingPct).toFixed(0)}% in de tweede helft. Dat is een teken van goede duurconditie.` });
      else advice.push({ tone: "watch", title: `Hartslag-drift van ${a.decouplingPct.toFixed(0)}%`, detail: "Je hartslag liep op bij hetzelfde tempo. Loop de lange duur 15–20 s/km rustiger en bouw de afstand pas daarna verder op." });
    }
    if (start != null && start <= -10) advice.push({ tone: "watch", title: "Eerste kilometer te enthousiast", detail: `Je eerste ${unitName} was ${Math.abs(start)} s/km sneller dan de rest. Laat de eerste kilometers bewust langzaam voelen.` });
    return advice.slice(0, 4);
  }

  // easy
  if (a.pattern === "variable") advice.push({ tone: "watch", title: "Onrustig tempo voor een rustige loop", detail: `Je tempo schommelde sterk (${a.cvPct?.toFixed(1)}% spreiding). Loop op gevoel en hartslag, niet op tempo. Zo blijft rustig ook echt rustig.` });
  if (a.pattern === "heavy-fade" || a.pattern === "fade") advice.push({ tone: "watch", title: "Je werd langzamer tijdens een rustige loop", detail: "Dat betekent meestal een te snelle start. Een rustige loop voelt bij de laatste kilometer net zo makkelijk als bij de eerste." });
  if (a.pattern === "even" || a.pattern === "negative") advice.push({ tone: "good", title: "Beheerst en gelijkmatig", detail: "Je tempo bleef stabiel, precies wat je van een rustige training wilt." });
  if (start != null && start <= -10 && a.pattern !== "heavy-fade") advice.push({ tone: "watch", title: "Te snel gestart", detail: `De eerste ${unitName} lag ${Math.abs(start)} s/km boven de rest. Begin rustiger, dan blijft je hartslag laag.` });
  if (a.hrDriftPct != null && a.hrDriftPct > 8) advice.push({ tone: "watch", title: `Hartslag steeg ${a.hrDriftPct.toFixed(0)}% bij gelijk tempo`, detail: "Warm weer, uitdroging of te weinig herstel kunnen dit veroorzaken. Controleer of je goed hersteld bent voor de volgende zware training." });
  return advice.slice(0, 4);
}

/* ---------- comparison with similar runs ---------- */

export type SimilarComparison = { count: number; paceDeltaSec: number | null; hrDelta: number | null; rank: number; basis: string };

export function compareToSimilar(run: AnalysisRun, allRuns: AnalysisRun[]): SimilarComparison | null {
  const kind = classifyRun(run);
  const band = kind === "race" ? distanceBand(run.distanceM) : null;
  const similar = allRuns.filter((other) => other.id !== run.id && other.startDate < run.startDate && other.distanceM > 0
    && classifyRun(other) === kind
    && (band ? distanceBand(other.distanceM)?.key === band.key : Math.abs(other.distanceM - run.distanceM) / run.distanceM <= 0.25));
  const paces = similar.flatMap((other) => runPaceSec(other) ?? []);
  const runPace = runPaceSec(run);
  if (paces.length < MIN_SAMPLES || runPace == null) return null;
  const hrs = similar.flatMap((other) => other.avgHr ?? []);
  const rank = paces.filter((pace) => pace < runPace).length + 1;
  return {
    count: paces.length,
    paceDeltaSec: round(runPace - median(paces)!, 1),
    hrDelta: run.avgHr != null && hrs.length >= MIN_SAMPLES ? round(run.avgHr - median(hrs)!, 1) : null,
    rank,
    basis: band ? `eerdere ${band.label}-wedstrijden` : `${KIND_LABEL[kind].toLowerCase()} van vergelijkbare lengte`,
  };
}

/* ---------- overall analysis ---------- */

export type KindSummary = { kind: RunKind; label: string; count: number; totalKm: number; avgDistanceKm: number; paceSec: number | null; avgHr: number | null; cadenceSpm: number | null };
export type RaceRow = { id: number; name: string; date: Date; band: string | null; distanceKm: number; timeS: number; paceSec: number | null; avgHr: number | null; hrPctMax: number | null; easyGapSec: number | null; pattern: PacingPattern | null; fadeSec: number | null; startDeltaSec: number | null };
export type Prediction = { label: string; timeS: number; paceSec: number };
export type StyleGroup = { label: string; runs: number; avgSplitDiffSec: number | null; avgStartDeltaSec: number | null; avgCvPct: number | null; avgDecouplingPct: number | null };
export type Insight = { id: string; tone: Tone; area: string; title: string; evidence: string; advice: string };

export type RunAnalysis = {
  headline: { tone: Tone; title: string; body: string };
  insights: Insight[];
  kinds: KindSummary[];
  races: RaceRow[];
  trainingVsRace: { racePaceSec: number; easyPaceSec: number; gapSec: number; raceHr: number | null; trainingHr: number | null } | null;
  predictions: { source: "race" | "training"; basis: string; items: Prediction[] } | null;
  style: { race: StyleGroup | null; training: StyleGroup | null; analyzedRuns: number } | null;
  coverage: { total: number; withSplits: number; missingRecent: Array<{ id: number; name: string; date: Date }> };
  form: { efficiencyChangePct: number | null; recentKm28: number; previousKm28: number; runsPerWeek: number };
};

const PREDICT_TARGETS = [{ label: "5 km", m: 5000 }, { label: "10 km", m: 10000 }, { label: "Halve marathon", m: 21097.5 }];
// Riegel: T2 = T1 × (D2/D1)^1.06
const riegel = (timeS: number, fromM: number, toM: number) => timeS * (toM / fromM) ** 1.06;

export function buildRunAnalysis(runs: AnalysisRun[], now = new Date()): RunAnalysis {
  const sorted = [...runs].filter((run) => run.distanceM >= 500).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const kindOf = new Map(sorted.map((run) => [run.id, classifyRun(run)]));
  const since = (days: number) => sorted.filter((run) => run.startDate.getTime() >= now.getTime() - days * DAY_MS);
  const maxHrObserved = sorted.reduce((max, run) => Math.max(max, run.maxHr ?? 0), 0) || null;

  const kinds: KindSummary[] = (["easy", "long", "interval", "race"] as RunKind[]).map((kind) => {
    const list = sorted.filter((run) => kindOf.get(run.id) === kind);
    const distance = list.reduce((sum, run) => sum + run.distanceM, 0);
    const time = list.reduce((sum, run) => sum + run.movingTimeS, 0);
    return {
      kind, label: KIND_LABEL[kind], count: list.length, totalKm: distance / 1000, avgDistanceKm: list.length ? distance / 1000 / list.length : 0,
      paceSec: distance > 0 && time > 0 ? time / (distance / 1000) : null,
      avgHr: mean(list.flatMap((run) => run.avgHr ?? [])), cadenceSpm: mean(list.flatMap((run) => run.cadenceSpm ?? [])),
    };
  });

  const insights: Insight[] = [];

  /* volume and consistency */
  const last28 = since(28);
  const prev28 = sorted.filter((run) => run.startDate.getTime() < now.getTime() - 28 * DAY_MS && run.startDate.getTime() >= now.getTime() - 56 * DAY_MS);
  const km = (list: AnalysisRun[]) => list.reduce((sum, run) => sum + run.distanceM, 0) / 1000;
  const recentKm28 = km(last28);
  const previousKm28 = km(prev28);
  const runsPerWeek = last28.length / 4;
  if (last28.length >= MIN_SAMPLES && prev28.length >= MIN_SAMPLES && previousKm28 > 0) {
    const change = ((recentKm28 - previousKm28) / previousKm28) * 100;
    if (change > 30) insights.push({ id: "volume-jump", tone: "action", area: "Belasting", title: `Je volume steeg ${Math.round(change)}% in 4 weken`, evidence: `${recentKm28.toFixed(0)} km tegenover ${previousKm28.toFixed(0)} km in de 4 weken ervoor.`, advice: "Een stijging boven ~30% vergroot de kans op blessures. Houd komende week hetzelfde volume of neem een rustweek en bouw daarna met maximaal 10% per week op." });
    else if (change < -30) insights.push({ id: "volume-drop", tone: "info", area: "Belasting", title: `Je volume daalde ${Math.round(Math.abs(change))}%`, evidence: `${recentKm28.toFixed(0)} km tegenover ${previousKm28.toFixed(0)} km in de 4 weken ervoor.`, advice: "Gepland herstel is prima. Was het niet gepland, plan dan nu twee vaste loopdagen en bouw vanaf daar rustig op." });
    else if (change >= 5) insights.push({ id: "volume-steady-up", tone: "good", area: "Belasting", title: "Gezonde opbouw van je volume", evidence: `${recentKm28.toFixed(0)} km tegenover ${previousKm28.toFixed(0)} km in de 4 weken ervoor (+${Math.round(change)}%).`, advice: "Houd dit tempo van opbouwen vast en plan elke vierde week een lichtere week." });
  }
  const longest28 = last28.reduce((max, run) => Math.max(max, run.distanceM / 1000), 0);
  if (last28.length >= MIN_SAMPLES && recentKm28 > 0) {
    const share = longest28 / (recentKm28 / 4);
    if (share > 0.55 && longest28 >= 8) insights.push({ id: "long-run-share", tone: "watch", area: "Belasting", title: "Je lange loop is groot ten opzichte van je weekvolume", evidence: `Je langste loop (${longest28.toFixed(1)} km) is ${Math.round(share * 100)}% van je gemiddelde weekvolume (${(recentKm28 / 4).toFixed(0)} km).`, advice: "Als vuistregel blijft één loop onder ~40–50% van je weekvolume. Voeg een of twee rustige loopjes toe voordat je de lange duur verder verlengt." });
  }

  /* training intensity: easy runs that are too hard */
  const easyRuns = since(56).filter((run) => (kindOf.get(run.id) === "easy" || kindOf.get(run.id) === "long") && run.avgHr != null);
  if (maxHrObserved && easyRuns.length >= 4) {
    const hard = easyRuns.filter((run) => run.avgHr! / maxHrObserved >= 0.84);
    const share = hard.length / easyRuns.length;
    if (share >= 0.5) insights.push({ id: "easy-too-hard", tone: "action", area: "Intensiteit", title: "Je rustige loopjes zijn niet rustig genoeg", evidence: `${hard.length} van je ${easyRuns.length} rustige en lange runs in de laatste 8 weken lagen boven 84% van je hoogst gemeten hartslag (${Math.round(maxHrObserved)} bpm).`, advice: "Loop de meeste kilometers 30–60 s/km langzamer, zodat je gemakkelijk kunt praten. Dan herstel je tussen de zware trainingen en kun je op interval- en wedstrijddagen echt sneller." });
    else if (share <= 0.2) insights.push({ id: "easy-well-paced", tone: "good", area: "Intensiteit", title: "Je rustige runs zijn echt rustig", evidence: `Slechts ${hard.length} van je ${easyRuns.length} rustige en lange runs kwam boven 84% van je maximale hartslag uit.`, advice: "Dit is een goede basis. Gebruik die ruimte voor één kwaliteitstraining per week." });
  }

  /* efficiency: speed per heartbeat on easy/long runs */
  const efficiencyOf = (run: AnalysisRun) => (run.distanceM / (run.movingTimeS / 60)) / run.avgHr!;
  const effPool = sorted.filter((run) => (kindOf.get(run.id) === "easy" || kindOf.get(run.id) === "long") && run.avgHr && run.avgHr > 90 && run.movingTimeS > 0 && run.distanceM >= 3000);
  const effRecent = effPool.filter((run) => run.startDate.getTime() >= now.getTime() - 42 * DAY_MS);
  const effPrior = effPool.filter((run) => run.startDate.getTime() < now.getTime() - 42 * DAY_MS && run.startDate.getTime() >= now.getTime() - 84 * DAY_MS);
  let efficiencyChangePct: number | null = null;
  if (effRecent.length >= MIN_SAMPLES && effPrior.length >= MIN_SAMPLES) {
    efficiencyChangePct = ((mean(effRecent.map(efficiencyOf))! - mean(effPrior.map(efficiencyOf))!) / mean(effPrior.map(efficiencyOf))!) * 100;
    if (efficiencyChangePct >= 2) insights.push({ id: "efficiency-up", tone: "good", area: "Vorm", title: `Je loopt ${efficiencyChangePct.toFixed(1)}% efficiënter`, evidence: `Bij dezelfde hartslag leg je meer meters af dan in de 6 weken ervoor (${effRecent.length} runs tegenover ${effPrior.length}).`, advice: "Je conditie neemt aantoonbaar toe. Dit is het moment om één stevige kwaliteitstraining per week toe te voegen." });
    else if (efficiencyChangePct <= -2) insights.push({ id: "efficiency-down", tone: "watch", area: "Vorm", title: `Je efficiëntie daalde ${Math.abs(efficiencyChangePct).toFixed(1)}%`, evidence: `Bij dezelfde hartslag loop je langzamer dan in de 6 weken ervoor (${effRecent.length} runs tegenover ${effPrior.length}).`, advice: "Dat past bij vermoeidheid, warmte of te weinig rust. Neem een lichtere week en kijk of je efficiëntie terugkomt voordat je intensiteit toevoegt." });
    else insights.push({ id: "efficiency-flat", tone: "info", area: "Vorm", title: "Je efficiëntie is stabiel", evidence: `Bij dezelfde hartslag loop je ongeveer even snel als in de 6 weken ervoor (${efficiencyChangePct >= 0 ? "+" : ""}${efficiencyChangePct.toFixed(1)}%).`, advice: "Stabiel is prima als je op niveau wilt blijven. Wil je sneller worden, dan is een wekelijkse tempoprikkel de volgende stap." });
  }

  /* cadence */
  const cadenceRuns = since(84).filter((run) => run.cadenceSpm != null && runPaceSec(run) != null);
  if (cadenceRuns.length >= 6) {
    const paceMedian = median(cadenceRuns.map((run) => runPaceSec(run)!))!;
    const fast = cadenceRuns.filter((run) => runPaceSec(run)! < paceMedian);
    const slow = cadenceRuns.filter((run) => runPaceSec(run)! >= paceMedian);
    const fastCad = mean(fast.map((run) => run.cadenceSpm!));
    const slowCad = mean(slow.map((run) => run.cadenceSpm!));
    const avgCad = mean(cadenceRuns.map((run) => run.cadenceSpm!))!;
    if (fastCad != null && slowCad != null && fastCad - slowCad < 2 && mean(slow.map((run) => runPaceSec(run)!))! - mean(fast.map((run) => runPaceSec(run)!))! > 25) {
      insights.push({ id: "cadence-flat", tone: "watch", area: "Loopstijl", title: "Je gaat sneller met een grotere stap, niet met meer pasfrequentie", evidence: `Je cadans is ${Math.round(fastCad)} spm in je snellere runs en ${Math.round(slowCad)} spm in je langzamere.`, advice: "Probeer in een rustige loop je cadans 5% omhoog te brengen met een metronoom of muziek op ~170 bpm. Kortere, snellere stappen belasten knieën en kuiten doorgaans minder." });
    } else if (avgCad < 160) {
      insights.push({ id: "cadence-low", tone: "info", area: "Loopstijl", title: `Lage cadans (${Math.round(avgCad)} spm)`, evidence: "Gemiddeld over je runs van de laatste 12 weken.", advice: "Een cadans onder ~160 gaat vaak samen met overstappen. Oefen 4 × 1 minuut per training met 5% hogere cadans." });
    }
  }

  /* races and predictions */
  const raceRuns = sorted.filter((run) => kindOf.get(run.id) === "race");
  const races: RaceRow[] = [...raceRuns].reverse().map((run) => {
    const before = sorted.filter((other) => other.startDate < run.startDate && other.startDate.getTime() >= run.startDate.getTime() - 42 * DAY_MS && kindOf.get(other.id) === "easy");
    const easyPace = before.length >= MIN_SAMPLES ? mean(before.flatMap((other) => runPaceSec(other) ?? [])) : null;
    const pace = runPaceSec(run);
    const analysis = analyzePacing(parseKmSplits(run.raw), "race", { maxHrObserved });
    return {
      id: run.id, name: run.name, date: run.startDate, band: distanceBand(run.distanceM)?.label ?? null, distanceKm: run.distanceM / 1000, timeS: run.movingTimeS, paceSec: pace, avgHr: run.avgHr,
      hrPctMax: run.avgHr && maxHrObserved ? (run.avgHr / maxHrObserved) * 100 : null,
      easyGapSec: pace != null && easyPace != null ? easyPace - pace : null,
      pattern: analysis?.pattern ?? null, fadeSec: analysis ? Math.round(analysis.splitDiffSec) : null, startDeltaSec: analysis?.firstUnitDeltaSec != null ? Math.round(analysis.firstUnitDeltaSec) : null,
    };
  });

  const trainingPool = sorted.filter((run) => kindOf.get(run.id) === "easy" && run.startDate.getTime() >= now.getTime() - 120 * DAY_MS);
  let trainingVsRace: RunAnalysis["trainingVsRace"] = null;
  const easyPaced = trainingPool.flatMap((run) => runPaceSec(run) ?? []);
  if (raceRuns.length >= 1 && easyPaced.length >= MIN_SAMPLES) {
    const raceDistance = raceRuns.reduce((sum, run) => sum + run.distanceM, 0);
    const raceTime = raceRuns.reduce((sum, run) => sum + run.movingTimeS, 0);
    const easyDistance = trainingPool.reduce((sum, run) => sum + run.distanceM, 0);
    const easyTime = trainingPool.reduce((sum, run) => sum + run.movingTimeS, 0);
    const racePaceSec = raceTime / (raceDistance / 1000);
    const easyPaceSec = easyTime / (easyDistance / 1000);
    trainingVsRace = { racePaceSec, easyPaceSec, gapSec: easyPaceSec - racePaceSec, raceHr: mean(raceRuns.flatMap((run) => run.avgHr ?? [])), trainingHr: mean(trainingPool.flatMap((run) => run.avgHr ?? [])) };
    const gap = trainingVsRace.gapSec;
    if (gap < 25) insights.push({ id: "gap-small", tone: "watch", area: "Wedstrijd", title: "Training en wedstrijd liggen te dicht bij elkaar", evidence: `Je rustige runs (${formatPaceSec(easyPaceSec)}/km) zijn maar ${Math.round(gap)} s/km langzamer dan je wedstrijden (${formatPaceSec(racePaceSec)}/km).`, advice: "Of je rustige loopjes zijn te snel, of je loopt in wedstrijden onder je niveau. Loop rustige runs 30–45 s/km langzamer en voeg één training op wedstrijdtempo toe, dan zie je vanzelf welke van de twee het is." });
    else if (gap > 100) insights.push({ id: "gap-large", tone: "info", area: "Wedstrijd", title: "Groot verschil tussen training en wedstrijd", evidence: `Je rustige runs (${formatPaceSec(easyPaceSec)}/km) liggen ${Math.round(gap)} s/km boven je wedstrijdtempo (${formatPaceSec(racePaceSec)}/km).`, advice: "Je traint ruim onder wedstrijdtempo. Voeg wekelijks een blok toe op wedstrijdtempo (bijvoorbeeld 3 × 8 minuten), zodat dat tempo tijdens de wedstrijd bekend aanvoelt." });
    else insights.push({ id: "gap-ok", tone: "good", area: "Wedstrijd", title: "Gezond verschil tussen training en wedstrijd", evidence: `Je rustige runs zijn ${Math.round(gap)} s/km langzamer dan je wedstrijdtempo.`, advice: "Je rustige training is rustig genoeg en je wedstrijdtempo ligt er duidelijk boven. Houd die verhouding vast." });
  }

  // predictions from the best race (<=18 months) or, lacking one, from the best recent training effort
  let predictions: RunAnalysis["predictions"] = null;
  const raceCandidates = raceRuns.filter((run) => run.distanceM >= 3000 && run.movingTimeS > 0 && run.startDate.getTime() >= now.getTime() - 548 * DAY_MS);
  const bestBy = (list: AnalysisRun[]) => list.reduce<AnalysisRun | null>((best, run) => {
    const target = riegel(run.movingTimeS, run.distanceM, 10000);
    return best == null || target < riegel(best.movingTimeS, best.distanceM, 10000) ? run : best;
  }, null);
  const raceBasis = bestBy(raceCandidates);
  const trainingCandidates = since(56).filter((run) => run.distanceM >= 5000 && run.distanceM <= 25000 && run.movingTimeS > 0 && kindOf.get(run.id) !== "race");
  const trainingBasis = trainingCandidates.length >= MIN_SAMPLES ? bestBy(trainingCandidates) : null;
  const basis = raceBasis ?? trainingBasis;
  if (basis) {
    const items = PREDICT_TARGETS.map((target) => { const timeS = riegel(basis.movingTimeS, basis.distanceM, target.m); return { label: target.label, timeS, paceSec: timeS / (target.m / 1000) }; });
    predictions = raceBasis
      ? { source: "race", basis: `${raceBasis.name} (${(raceBasis.distanceM / 1000).toFixed(1)} km in ${formatTime(raceBasis.movingTimeS)})`, items }
      : { source: "training", basis: `je snelste trainingsloop van de laatste 8 weken (${(basis.distanceM / 1000).toFixed(1)} km in ${formatTime(basis.movingTimeS)})`, items };
  }

  /* pacing style across runs with splits */
  const withSplits = sorted.filter((run) => parseKmSplits(run.raw).length >= MIN_SAMPLES);
  const analyses = withSplits.flatMap((run) => {
    const kind = kindOf.get(run.id)!;
    if (kind === "interval") return [];
    const analysis = analyzePacing(parseKmSplits(run.raw), kind, { maxHrObserved });
    return analysis ? [{ kind, analysis }] : [];
  });
  const group = (label: string, list: typeof analyses): StyleGroup | null => list.length >= MIN_SAMPLES ? {
    label, runs: list.length,
    avgSplitDiffSec: mean(list.map((item) => item.analysis.splitDiffSec)),
    avgStartDeltaSec: mean(list.flatMap((item) => item.analysis.firstUnitDeltaSec ?? [])),
    avgCvPct: mean(list.flatMap((item) => item.analysis.cvPct ?? [])),
    avgDecouplingPct: mean(list.flatMap((item) => item.analysis.decouplingPct ?? [])),
  } : null;
  const styleRace = group("Wedstrijden", analyses.filter((item) => item.kind === "race"));
  const styleTraining = group("Trainingen", analyses.filter((item) => item.kind !== "race"));
  const style = analyses.length ? { race: styleRace, training: styleTraining, analyzedRuns: analyses.length } : null;

  if (styleTraining?.avgStartDeltaSec != null && styleTraining.avgStartDeltaSec <= -8) insights.push({ id: "style-fast-start", tone: "action", area: "Loopstijl", title: "Je start structureel te snel", evidence: `Over ${styleTraining.runs} trainingen met kilometergegevens ligt je eerste kilometer gemiddeld ${Math.abs(Math.round(styleTraining.avgStartDeltaSec))} s/km onder de rest.`, advice: "Spreek met jezelf af dat de eerste kilometer de langzaamste is. Kijk bij de start niet naar de snelheid, maar naar je hartslag." });
  if (styleTraining?.avgSplitDiffSec != null && styleTraining.avgSplitDiffSec >= 8) insights.push({ id: "style-fade", tone: "watch", area: "Loopstijl", title: "Je loopt in de tweede helft vaak langzamer", evidence: `Gemiddeld ${Math.round(styleTraining.avgSplitDiffSec)} s/km verval in ${styleTraining.runs} trainingen.`, advice: "Een te snelle start is meestal de oorzaak. Loop de eerste helft 5–10 s/km rustiger en probeer de tweede helft gelijk of sneller te lopen." });
  if (styleTraining?.avgSplitDiffSec != null && styleTraining.avgSplitDiffSec < 8 && styleTraining.avgSplitDiffSec > -8 && styleTraining.avgStartDeltaSec != null && styleTraining.avgStartDeltaSec > -8 && styleTraining.avgCvPct != null && styleTraining.avgCvPct < 5) insights.push({ id: "style-even", tone: "good", area: "Loopstijl", title: "Je tempoverdeling is goed", evidence: `Over ${styleTraining.runs} trainingen met kilometergegevens loop je gelijkmatig (${styleTraining.avgCvPct.toFixed(1)}% spreiding tussen kilometers).`, advice: "Houd dit vast. Nu je tempo stabiel is, kun je gericht snelheid toevoegen." });
  if (styleRace && styleTraining && styleRace.avgSplitDiffSec != null && styleTraining.avgSplitDiffSec != null && styleRace.avgSplitDiffSec - styleTraining.avgSplitDiffSec >= 8) insights.push({ id: "style-race-vs-training", tone: "action", area: "Wedstrijd", title: "In wedstrijden val je meer terug dan in training", evidence: `Gemiddeld ${Math.round(styleRace.avgSplitDiffSec)} s/km verval in wedstrijden tegenover ${Math.round(styleTraining.avgSplitDiffSec)} s/km in trainingen.`, advice: "Je start in wedstrijden te enthousiast. Oefen de eerste twee kilometers van je wedstrijdtempo in een lange tempotraining en volg in de wedstrijd een vast plan." });

  const coverage = {
    total: sorted.length, withSplits: withSplits.length,
    missingRecent: [...sorted].reverse().filter((run) => parseKmSplits(run.raw).length === 0 && run.distanceM >= 3000).slice(0, 15).map((run) => ({ id: run.id, name: run.name, date: run.startDate })),
  };

  const order: Record<Tone, number> = { action: 0, watch: 1, good: 2, info: 3 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);

  let headline: RunAnalysis["headline"];
  if (sorted.length < MIN_SAMPLES) headline = { tone: "info", title: "Nog te weinig runs voor een analyse", body: "Zodra er minimaal 3 runs zijn, bouwt Pulse hier je persoonlijke analyse op." };
  else if (insights.some((item) => item.tone === "action")) { const top = insights.find((item) => item.tone === "action")!; headline = { tone: "action", title: top.title, body: top.advice }; }
  else if (insights.some((item) => item.tone === "watch")) { const top = insights.find((item) => item.tone === "watch")!; headline = { tone: "watch", title: top.title, body: top.advice }; }
  else if (insights.some((item) => item.tone === "good")) { const top = insights.find((item) => item.tone === "good")!; headline = { tone: "good", title: top.title, body: top.advice }; }
  else headline = { tone: "info", title: "Je data is nog beperkt", body: "Blijf runs synchroniseren; voor trends heeft Pulse minimaal 3 runs per periode nodig." };

  return { headline, insights, kinds, races, trainingVsRace, predictions, style, coverage, form: { efficiencyChangePct, recentKm28, previousKm28, runsPerWeek } };
}

/* ---------- race candidates ---------- */

export type RaceCandidate = { id: number; name: string; date: Date; band: string; distanceKm: number; timeS: number; paceSec: number; fasterThanNeighboursSec: number; reasons: string[] };

// Suggests runs that probably were a race but are not marked as one: a standard race distance that was
// clearly faster (and harder) than the athlete's other runs around that date. The athlete confirms or rejects.
export function findRaceCandidates(runs: AnalysisRun[]): RaceCandidate[] {
  const pool = runs.filter((run) => run.distanceM >= 3000 && run.movingTimeS > 0);
  const candidates: RaceCandidate[] = [];
  for (const run of runs) {
    if (run.kindOverride || classifyRun(run) === "race") continue;
    const band = distanceBand(run.distanceM);
    const pace = runPaceSec(run);
    if (!band || pace == null) continue;
    const neighbours = pool.filter((other) => other.id !== run.id && Math.abs(other.startDate.getTime() - run.startDate.getTime()) <= 42 * DAY_MS && classifyRun(other) !== "race");
    const neighbourPaces = neighbours.flatMap((other) => runPaceSec(other) ?? []);
    if (neighbourPaces.length < MIN_SAMPLES) continue;
    const faster = median(neighbourPaces)! - pace;
    const reasons = [`${round(faster)} s/km sneller dan je andere runs in die 6 weken`];
    const neighbourHr = neighbours.flatMap((other) => other.avgHr ?? []);
    const hrHigher = run.avgHr != null && neighbourHr.length >= MIN_SAMPLES ? run.avgHr - median(neighbourHr)! : null;
    if (hrHigher != null && hrHigher >= 5) reasons.push(`hartslag ${round(hrHigher)} bpm hoger dan normaal`);
    const weekend = [0, 6].includes(run.startDate.getUTCDay());
    if (weekend) reasons.push("in het weekend");
    const strong = faster >= 40 || (faster >= 25 && hrHigher != null && hrHigher >= 5);
    if (!strong) continue;
    candidates.push({ id: run.id, name: run.name, date: run.startDate, band: band.label, distanceKm: run.distanceM / 1000, timeS: run.movingTimeS, paceSec: pace, fasterThanNeighboursSec: round(faster), reasons });
  }
  return candidates.sort((a, b) => b.fasterThanNeighboursSec - a.fasterThanNeighboursSec).slice(0, 8);
}

/* ---------- all events (races) ---------- */

export type EventRow = {
  id: number; name: string; date: Date; distanceKm: number; timeS: number; paceSec: number | null; avgHr: number | null;
  isPr: boolean; deltaPrevSec: number | null; // pace vs previous event on the same distance, negative = faster
  prepWeeklyKm: number | null; prepLongestKm: number | null; prepRuns: number; taperPct: number | null; // km in last 7 days as % of weekly average
  pattern: PacingPattern | null; fadeSec: number | null; startDeltaSec: number | null;
};
export type EventGroup = { key: string; label: string; events: EventRow[]; prId: number | null; advice: Advice[] };

const avg = (list: number[]) => mean(list);

export function buildEventAnalysis(runs: AnalysisRun[]): EventGroup[] {
  const sorted = [...runs].filter((run) => run.distanceM >= 500).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const maxHrObserved = sorted.reduce((max, run) => Math.max(max, run.maxHr ?? 0), 0) || null;
  const races = sorted.filter((run) => classifyRun(run) === "race");
  const groups = new Map<string, { label: string; runs: AnalysisRun[] }>();
  for (const race of races) {
    const band = distanceBand(race.distanceM);
    const key = band?.key ?? "other";
    const entry = groups.get(key) ?? { label: band?.label ?? "Overige afstanden", runs: [] };
    entry.runs.push(race);
    groups.set(key, entry);
  }

  const order = ["5k", "10k", "10em", "half", "marathon", "other"];
  return [...groups.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([key, group]) => {
    const comparable = key !== "other";
    const fastest = comparable ? group.runs.reduce((best, run) => (run.movingTimeS < best.movingTimeS ? run : best)) : null;
    const events: EventRow[] = group.runs.map((run, position) => {
      const start = run.startDate.getTime();
      const prep = sorted.filter((other) => other.id !== run.id && other.startDate.getTime() < start && other.startDate.getTime() >= start - 42 * DAY_MS && classifyRun(other) !== "race");
      const prepKm = prep.reduce((sum, other) => sum + other.distanceM, 0) / 1000;
      const weekly = prep.length >= MIN_SAMPLES ? prepKm / 6 : null;
      const lastWeekKm = prep.filter((other) => other.startDate.getTime() >= start - 7 * DAY_MS).reduce((sum, other) => sum + other.distanceM, 0) / 1000;
      const pace = runPaceSec(run);
      const previous = comparable && position > 0 ? runPaceSec(group.runs[position - 1]) : null;
      const analysis = analyzePacing(parseKmSplits(run.raw), "race", { maxHrObserved });
      return {
        id: run.id, name: run.name, date: run.startDate, distanceKm: run.distanceM / 1000, timeS: run.movingTimeS, paceSec: pace, avgHr: run.avgHr,
        isPr: fastest?.id === run.id, deltaPrevSec: pace != null && previous != null ? round(pace - previous, 1) : null,
        prepWeeklyKm: weekly != null ? round(weekly, 1) : null, prepLongestKm: prep.length ? round(Math.max(...prep.map((other) => other.distanceM / 1000)), 1) : null, prepRuns: prep.length,
        taperPct: weekly != null && weekly > 0 ? Math.round((lastWeekKm / weekly) * 100) : null,
        pattern: analysis?.pattern ?? null, fadeSec: analysis ? Math.round(analysis.splitDiffSec) : null, startDeltaSec: analysis?.firstUnitDeltaSec != null ? Math.round(analysis.firstUnitDeltaSec) : null,
      };
    });

    const advice: Advice[] = [];
    if (comparable && events.length >= MIN_SAMPLES) {
      const paces = events.flatMap((event) => event.paceSec ?? []);
      const latest = events.at(-1)!;
      const earlierMedian = median(events.slice(0, -1).flatMap((event) => event.paceSec ?? []));
      if (latest.paceSec != null && earlierMedian != null && paces.length >= MIN_SAMPLES) {
        const diff = latest.paceSec - earlierMedian;
        if (diff <= -5) advice.push({ tone: "good", title: `Je laatste ${group.label} was ${Math.abs(Math.round(diff))} s/km sneller dan gebruikelijk`, detail: "Je ontwikkeling op deze afstand gaat de goede kant op. Kijk hieronder wat je in de voorbereiding anders deed en herhaal dat." });
        else if (diff >= 5) advice.push({ tone: "watch", title: `Je laatste ${group.label} was ${Math.round(diff)} s/km langzamer dan gebruikelijk`, detail: "Vergelijk de voorbereiding met je snelste wedstrijd hieronder: weekvolume, lange loop en de laatste week voor de start." });
        else advice.push({ tone: "info", title: `Je ${group.label}-tempo is stabiel`, detail: "Je laatste wedstrijd lag binnen 5 s/km van je gebruikelijke niveau. Voor een sprong vooruit heb je een andere prikkel nodig, zoals wekelijkse tempoblokken." });
      }
      const withPrep = events.filter((event) => event.prepWeeklyKm != null && event.paceSec != null);
      if (withPrep.length >= 4) {
        const byPace = [...withPrep].sort((a, b) => a.paceSec! - b.paceSec!);
        const half = Math.floor(byPace.length / 2);
        const fastKm = avg(byPace.slice(0, half).map((event) => event.prepWeeklyKm!))!;
        const slowKm = avg(byPace.slice(-half).map((event) => event.prepWeeklyKm!))!;
        if (fastKm - slowKm >= 3) advice.push({ tone: "action", title: "Je snelste wedstrijden volgden op meer weekvolume", detail: `Voor je snelste ${half} wedstrijden liep je gemiddeld ${Math.round(fastKm)} km per week, voor je langzaamste ${half} ${Math.round(slowKm)} km. Bouw zes weken voor de volgende wedstrijd op naar minstens ${Math.round(fastKm)} km per week.` });
        else if (slowKm - fastKm >= 3) advice.push({ tone: "info", title: "Meer volume maakte je niet sneller", detail: `Je snelste wedstrijden volgden op ${Math.round(fastKm)} km per week, de langzaamste op ${Math.round(slowKm)}. Kwaliteit en frisheid lijken bij jou zwaarder te wegen dan kilometers.` });
      }
      const tapers = events.flatMap((event) => (event.taperPct != null ? [event.taperPct] : []));
      if (latest.taperPct != null && latest.taperPct > 90 && tapers.length >= 1) advice.push({ tone: "watch", title: "Weinig afbouw in de laatste week", detail: `In de week voor je laatste ${group.label} liep je ${latest.taperPct}% van je normale weekvolume. Neem de laatste 7 dagen terug naar 50–70% en houd een paar korte, snelle stukjes.` });
      const patterns = events.flatMap((event) => (event.fadeSec != null ? [event] : []));
      if (patterns.length >= MIN_SAMPLES) {
        const fade = avg(patterns.map((event) => event.fadeSec!))!;
        if (fade >= 8) advice.push({ tone: "action", title: `Over ${patterns.length} wedstrijden verlies je ${Math.round(fade)} s/km in de tweede helft`, detail: "Dat is een patroon, geen uitzondering. Start de eerste kilometers 5–10 s/km rustiger en train lange tempoblokken op wedstrijdtempo." });
        else if (fade <= 0) advice.push({ tone: "good", title: "Je verdeelt je wedstrijden goed", detail: `Gemiddeld ${Math.abs(Math.round(fade))} s/km sneller in de tweede helft over ${patterns.length} wedstrijden.` });
      }
    } else if (comparable) {
      advice.push({ tone: "info", title: `Nog te weinig ${group.label}-wedstrijden voor een trend`, detail: `Voor een vergelijking zijn minimaal ${MIN_SAMPLES} wedstrijden op dezelfde afstand nodig (nu ${events.length}).` });
    }
    return { key, label: group.label, events: [...events].reverse(), prId: fastest?.id ?? null, advice };
  });
}

/* ---------- verdict for every Strava entry ---------- */

export type DigestRow = {
  id: number; name: string; date: Date; kind: RunKind; distanceKm: number; timeS: number; paceSec: number | null; avgHr: number | null; elevationM: number | null;
  tone: Tone; verdict: string; detail: string; // verdict = short label, detail = one concrete sentence
  paceVsSimilarSec: number | null; efficiencyVsSimilarPct: number | null; pattern: PacingPattern | null; hasSplits: boolean;
};

const efficiencyOf = (run: AnalysisRun) => (run.avgHr && run.avgHr > 90 && run.movingTimeS > 0 ? run.distanceM / (run.movingTimeS / 60) / run.avgHr : null);

// One verdict per run. Uses kilometer splits when present, otherwise falls back to comparing summary data
// (pace, heart rate, meters per heartbeat) with the athlete's earlier runs of the same kind and length.
export function buildRunDigest(runs: AnalysisRun[]): DigestRow[] {
  const sorted = [...runs].filter((run) => run.distanceM >= 500).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const maxHrObserved = sorted.reduce((max, run) => Math.max(max, run.maxHr ?? 0), 0) || null;
  const bestRaceByBand = new Map<string, number>();
  for (const run of sorted) {
    const band = distanceBand(run.distanceM);
    if (band && classifyRun(run) === "race" && run.movingTimeS > 0) bestRaceByBand.set(band.key, Math.min(bestRaceByBand.get(band.key) ?? Infinity, run.movingTimeS));
  }

  return sorted.map((run) => {
    const kind = classifyRun(run);
    const pace = runPaceSec(run);
    const comparison = compareToSimilar(run, sorted);
    const similar = sorted.filter((other) => other.id !== run.id && other.startDate < run.startDate && classifyRun(other) === kind && Math.abs(other.distanceM - run.distanceM) / run.distanceM <= 0.25);
    const efficiencies = similar.flatMap((other) => efficiencyOf(other) ?? []);
    const ownEfficiency = efficiencyOf(run);
    const efficiencyVsSimilarPct = ownEfficiency != null && efficiencies.length >= MIN_SAMPLES ? round(((ownEfficiency - median(efficiencies)!) / median(efficiencies)!) * 100, 1) : null;
    const pacing = analyzePacing(parseKmSplits(run.raw), kind, { maxHrObserved });
    const band = distanceBand(run.distanceM);
    const base = { id: run.id, name: run.name, date: run.startDate, kind, distanceKm: run.distanceM / 1000, timeS: run.movingTimeS, paceSec: pace, avgHr: run.avgHr, elevationM: run.elevationM, paceVsSimilarSec: comparison?.paceDeltaSec ?? null, efficiencyVsSimilarPct, pattern: pacing?.pattern ?? null, hasSplits: pacing != null };

    const pick = (tone: Tone, verdict: string, detail: string): DigestRow => ({ ...base, tone, verdict, detail });
    const hardEasy = (kind === "easy" || kind === "long") && run.avgHr != null && maxHrObserved != null && run.avgHr / maxHrObserved >= 0.84;

    if (kind === "race") {
      if (band && run.movingTimeS > 0 && bestRaceByBand.get(band.key) === run.movingTimeS && sorted.filter((other) => classifyRun(other) === "race" && distanceBand(other.distanceM)?.key === band.key).length >= 2) return pick("good", "Snelste wedstrijd op deze afstand", `Je persoonlijk record op ${band.label}.`);
      if (pacing?.pattern === "heavy-fade") return pick("watch", "Sterk vervallen", `Tweede helft ${Math.round(pacing.splitDiffSec)} s/km langzamer. Start rustiger.`);
      if (pacing?.firstUnitDeltaSec != null && pacing.firstUnitDeltaSec <= -10) return pick("watch", "Te snel gestart", `Eerste kilometer ${Math.abs(Math.round(pacing.firstUnitDeltaSec))} s/km sneller dan de rest.`);
      if (pacing?.pattern === "negative" || pacing?.pattern === "even") return pick("good", pacing.pattern === "negative" ? "Negatieve split" : "Gelijkmatig gelopen", "Goed ingedeelde wedstrijd.");
      if (comparison?.paceDeltaSec != null && comparison.paceDeltaSec <= -3) return pick("good", "Sneller dan je vorige wedstrijden", `${Math.abs(Math.round(comparison.paceDeltaSec))} s/km onder je mediaan.`);
      return pick("info", "Wedstrijd", pacing ? "Geen bijzonderheden in het tempoverloop." : "Haal de splits op voor de analyse per kilometer.");
    }
    if (kind === "interval") {
      const fast = pacing?.pattern === "intervals" ? pacing.advice[0] : null;
      return fast ? pick(fast.tone, fast.title, fast.detail) : pick("info", "Interval / tempo", pacing ? "Geen duidelijke blokken herkend." : "Haal de splits op voor de analyse per blok.");
    }
    if (hardEasy) return pick("watch", kind === "long" ? "Lange duur te hard" : "Te hard voor rustig", `Gemiddeld ${Math.round(run.avgHr!)} bpm is ${Math.round((run.avgHr! / maxHrObserved!) * 100)}% van je maximum. Loop 30–60 s/km langzamer.`);
    if (pacing && (pacing.pattern === "heavy-fade" || pacing.pattern === "fade")) return pick("watch", "Langzamer geworden", `Tweede helft ${Math.round(pacing.splitDiffSec)} s/km langzamer${pacing.firstUnitDeltaSec != null && pacing.firstUnitDeltaSec <= -10 ? ", na een te snelle start" : ""}.`);
    if (pacing?.firstUnitDeltaSec != null && pacing.firstUnitDeltaSec <= -10) return pick("watch", "Te snel gestart", `Eerste kilometer ${Math.abs(Math.round(pacing.firstUnitDeltaSec))} s/km sneller dan de rest.`);
    if (efficiencyVsSimilarPct != null && efficiencyVsSimilarPct >= 3) return pick("good", "Efficiënter dan normaal", `${efficiencyVsSimilarPct}% meer meters per hartslag dan vergelijkbare runs.`);
    if (efficiencyVsSimilarPct != null && efficiencyVsSimilarPct <= -4) return pick("watch", "Zwaarder dan normaal", `${Math.abs(efficiencyVsSimilarPct)}% minder meters per hartslag dan vergelijkbare runs. Controleer je herstel.`);
    if (pacing && (pacing.pattern === "negative" || pacing.pattern === "even")) return pick("good", pacing.pattern === "negative" ? "Sterk opgebouwd" : "Gelijkmatig", "Je tempo bleef goed op koers.");
    return pick("info", comparison ? "Op je niveau" : "Te weinig vergelijkingsmateriaal", comparison?.paceDeltaSec != null ? `${comparison.paceDeltaSec <= 0 ? "" : "+"}${Math.round(comparison.paceDeltaSec)} s/km ten opzichte van vergelijkbare runs.` : `Voor een oordeel zijn minimaal ${MIN_SAMPLES} vergelijkbare eerdere runs nodig.`);
  });
}
