import { classifyRun, formatPaceSec, MIN_SAMPLES, type AnalysisRun, type PacingAnalysis, type RunKind } from "./run-analysis.ts";

/**
 * Pure training prescription. Pace zones come from the athlete's best recent effort
 * (race-equivalent, Daniels-style ratios), never from how slowly or quickly they usually jog.
 * Everything here is an estimate and says so in `basis`.
 */

const DAY = 86_400_000;
export type PaceRange = { fast: number; slow: number }; // seconds per km, fast < slow

export type PaceZones = {
  tenKPaceSec: number;
  basis: string;
  /** false when no race, tempo run or hard heart-rate effort was found and the zones are a cautious guess */
  reliable: boolean;
  recovery: PaceRange;
  easy: PaceRange;
  long: PaceRange;
  marathon: number;
  threshold: number;
  interval: number;
  easyHrCap: number | null;
};

const paceOf = (run: AnalysisRun) => (run.paceMinPerKm && run.paceMinPerKm > 2 ? run.paceMinPerKm * 60 : run.distanceM > 0 && run.movingTimeS > 0 ? run.movingTimeS / (run.distanceM / 1000) : null);
const round5 = (value: number) => Math.round(value / 5) * 5;
const roundHalf = (value: number) => Math.round(value * 2) / 2;
const km = (value: number) => value.toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: Number.isInteger(value) ? 0 : 1 });
const range = (lo: number, hi: number) => (lo === hi ? `${km(lo)}` : `${km(lo)}–${km(hi)}`);
const paceRangeText = (zone: PaceRange) => `${formatPaceSec(round5(zone.fast))}–${formatPaceSec(round5(zone.slow))}/km`;
export { paceRangeText };

/** Race-equivalent 10 km pace from the best qualifying run of the last 12 weeks (Riegel, exponent 1.06). Needs three runs of 4+ km. */
export function estimatePaceZones(runs: AnalysisRun[], now = new Date()): PaceZones | null {
  const since = now.getTime() - 84 * DAY;
  const eligible = runs.filter((run) => run.startDate.getTime() >= since && run.startDate.getTime() <= now.getTime() && run.distanceM >= 4000 && run.distanceM <= 25000 && run.movingTimeS > 0);
  if (eligible.length < MIN_SAMPLES) return null;
  const maxHr = runs.reduce((max, run) => Math.max(max, run.maxHr ?? 0), 0);
  const isEffort = (run: AnalysisRun) => { const kind = classifyRun(run); return kind === "race" || kind === "interval" || (maxHr >= 150 && run.avgHr != null && run.avgHr / maxHr >= 0.88); };
  const scored = eligible.flatMap((run) => {
    const pace = paceOf(run);
    if (pace == null || pace < 170 || pace > 720) return [];
    const tenK = run.movingTimeS * (10000 / run.distanceM) ** 1.06 / 10;
    return tenK < 170 ? [] : [{ run, tenK, effort: isEffort(run) }];
  });
  if (!scored.length) return null;
  const efforts = scored.filter((item) => item.effort);
  const reliable = efforts.length > 0;
  const best = (reliable ? efforts : scored).reduce((a, b) => (b.tenK < a.tenK ? b : a));
  // Without a real effort the fastest run says little about fitness: assume it was a steady run, not a race.
  const t = reliable ? best.tenK : best.tenK / 1.2;
  return {
    tenKPaceSec: t,
    reliable,
    basis: reliable ? `Je beste recente inspanning (${km(Math.round(best.run.distanceM / 100) / 10)} km in ${formatPaceSec(paceOf(best.run))}/km) komt overeen met ongeveer ${formatPaceSec(t)}/km op 10 km` : `Er staat geen wedstrijd, tempoloop of hartslag-inspanning in je laatste 12 weken. Deze zones zijn een voorzichtige schatting uit je snelste run (${formatPaceSec(paceOf(best.run))}/km); een echte test van 5 km maakt ze nauwkeuriger`,
    recovery: { fast: t * 1.3, slow: t * 1.42 },
    easy: { fast: t * 1.22, slow: t * 1.34 },
    long: { fast: t * 1.2, slow: t * 1.32 },
    marathon: t * 1.14,
    threshold: t * 1.035,
    interval: t * 0.96,
    easyHrCap: maxHr >= 150 ? Math.round(maxHr * 0.8) : null,
  };
}

/* ---------- reserve in the second half ---------- */

export type PaceReserve = { hasReserve: boolean; reason: string | null; push: PaceRange | null; firstHalfPaceSec: number; secondHalfPaceSec: number };

/**
 * A faster second half is only recommended when the numbers show room: an even or negative split,
 * no heart-rate drift or decoupling, and a finish that was clearly faster than the rest or a heart rate far below max.
 */
export function assessPaceReserve(pacing: PacingAnalysis | null, kind: RunKind, avgHr: number | null, maxHr: number | null): PaceReserve | null {
  if (!pacing || kind === "interval") return null;
  const calm = (pacing.hrDriftPct == null || pacing.hrDriftPct <= 5) && (pacing.decouplingPct == null || pacing.decouplingPct <= 4);
  const evenEnough = pacing.pattern === "even" || pacing.pattern === "negative";
  const strongFinish = pacing.lastUnitDeltaSec != null && pacing.lastUnitDeltaSec <= -6;
  const lowHr = avgHr != null && maxHr != null && maxHr >= 150 && avgHr / maxHr <= (kind === "race" ? 0.85 : 0.78);
  const signals: string[] = [];
  if (strongFinish) signals.push(`je laatste kilometer was ${Math.abs(Math.round(pacing.lastUnitDeltaSec!))} s/km sneller dan de rest`);
  if (pacing.hrDriftPct != null && pacing.hrDriftPct <= 3) signals.push(`je hartslag steeg maar ${Math.max(0, pacing.hrDriftPct).toFixed(0)}%`);
  if (pacing.decouplingPct != null && pacing.decouplingPct <= 2) signals.push("je efficiëntie bleef gelijk");
  if (lowHr) signals.push(`je gemiddelde hartslag lag op ${Math.round((avgHr! / maxHr!) * 100)}% van je maximum`);
  const hasReserve = evenEnough && calm && (strongFinish || lowHr || (pacing.pattern === "negative" && signals.length >= 1));
  const base = pacing.secondHalfPaceSec;
  return { hasReserve, reason: hasReserve ? signals.slice(0, 3).join(", ") : null, push: hasReserve ? { fast: base - 10, slow: base - 5 } : null, firstHalfPaceSec: pacing.firstHalfPaceSec, secondHalfPaceSec: pacing.secondHalfPaceSec };
}

/* ---------- next run ---------- */

export type PrescriptionKind = "rest" | "recovery" | "easy" | "long" | "quality";
export type RunPrescription = { kind: PrescriptionKind; title: string; detail: string; why: string; distanceKm: [number, number] | null; paceSec: PaceRange | null };
export type PrescriptionInput = {
  runs: AnalysisRun[]; // runs up to the moment of advice
  now: Date;
  daysSinceLast: number | null;
  readiness: number | null;
  loadChangePct: number | null;
  recoveryAdverse?: boolean;
  pacing?: PacingAnalysis | null;
  zones?: PaceZones | null;
};

const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const isDemanding = (run: AnalysisRun) => { const kind = classifyRun(run); return kind === "race" || kind === "interval" || kind === "long" || run.distanceM >= 12000; };

/** Rest days a run asks for before the next normal training, by what it was. */
export function restDaysAfter(run: AnalysisRun): number {
  const kind = classifyRun(run);
  const distance = run.distanceM / 1000;
  if (kind === "race") return distance >= 15 ? 3 : distance >= 8 ? 2 : 1;
  if (kind === "long" || distance >= 15) return 2;
  if (kind === "interval" || distance >= 12) return 1;
  return 0;
}

function sessionLayout(zones: PaceZones, runs28: number, easyMid: number) {
  const blocks = runs28 >= 12 ? { n: 3, min: 7 } : { n: 2, min: 8 };
  const thrKm = (blocks.n * blocks.min * 60) / zones.threshold;
  const jogKm = ((blocks.n - 1) * 2 * 60) / zones.recovery.slow;
  const warmKm = (20 * 60) / easyMid;
  return { ...blocks, totalKm: thrKm + jogKm + warmKm };
}

export function prescribeNextRun(input: PrescriptionInput): RunPrescription {
  const { runs, now, daysSinceLast, readiness, loadChangePct, pacing } = input;
  const zones = input.zones === undefined ? estimatePaceZones(runs, now) : input.zones;
  const sorted = [...runs].filter((run) => run.startDate.getTime() <= now.getTime()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const last = sorted[0] ?? null;
  const runs28 = sorted.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * DAY);
  const runs42 = sorted.filter((run) => run.startDate.getTime() >= now.getTime() - 42 * DAY);
  const weekKm = runs28.reduce((sum, run) => sum + run.distanceM / 1000, 0) / 4;
  const runDays7 = new Set(sorted.filter((run) => run.startDate.getTime() >= now.getTime() - 7 * DAY).map((run) => dayKey(run.startDate))).size;
  const easyMid = zones ? (zones.easy.fast + zones.easy.slow) / 2 : 0;
  const hrNote = zones?.easyHrCap ? ` Hartslag onder ongeveer ${zones.easyHrCap} slagen per minuut.` : "";
  const enoughData = runs28.length >= MIN_SAMPLES;

  const rest = (title: string, detail: string, why: string): RunPrescription => ({ kind: "rest", title, detail, why, distanceKm: null, paceSec: null });
  const needed = last ? restDaysAfter(last) : 0;
  const adverse = (readiness != null && readiness < 58) || (loadChangePct != null && loadChangePct > 30 && (daysSinceLast ?? 0) <= 2) || input.recoveryAdverse === true;

  if (!last || daysSinceLast == null) {
    return zones ? { kind: "easy", title: "Duurloop op gesprekstempo", detail: `25–35 min op ${paceRangeText(zones.easy)}.${hrNote}`, why: zones.basis, distanceKm: null, paceSec: zones.easy } : rest("Begin met rustig lopen", "25–35 min op gesprekstempo; je kunt volledige zinnen spreken.", "Er zijn nog te weinig runs om tempo en afstand uit je cijfers af te leiden.");
  }
  if (daysSinceLast === 0) return rest("Vandaag niet nogmaals lopen", `Herstel na ${km(Math.round(last.distanceM / 100) / 10)} km · wandelen optioneel`, "Een tweede training op dezelfde dag levert minder op dan herstel, eten en slaap.");
  if (adverse) {
    const why = readiness != null && readiness < 58 ? `Je herstelscore is ${readiness}/100, onder je eigen basislijn.` : loadChangePct != null && loadChangePct > 30 ? `Je weekbelasting ligt ${loadChangePct}% boven je vierweekse basis.` : "Je herstelsignalen (HRV en rusthartslag) wijken af van je eigen basislijn.";
    return rest("Kies herstel boven kilometers", "Rust of 20–30 min wandelen. Hervat pas rustig wanneer je herstelsignalen terug zijn bij je basislijn.", why);
  }
  if (daysSinceLast < needed || (runDays7 >= 5 && daysSinceLast <= 1)) {
    const kind = classifyRun(last);
    const what = kind === "race" ? `een wedstrijd van ${km(Math.round(last.distanceM / 100) / 10)} km` : kind === "long" ? "een lange duurloop" : kind === "interval" ? "een zware sessie" : `${km(Math.round(last.distanceM / 100) / 10)} km`;
    const optional = zones && daysSinceLast >= 1 && needed - daysSinceLast <= 1 ? ` Wil je bewegen: 20–30 min (3–4 km) op ${paceRangeText(zones.recovery)}, zonder horloge-ambitie.` : "";
    const weeklyRest = daysSinceLast >= needed;
    const why = weeklyRest ? `Je liep de afgelopen 7 dagen op ${runDays7} dagen; een vaste rustdag houdt je opbouw gezond.` : `Na ${what} duurt herstel van spieren en pezen ongeveer ${needed} ${needed === 1 ? "dag" : "dagen"}.`;
    return rest("Maak er een rustdag van", optional ? `Rust.${optional}` : "Rust of 20–40 min wandelen.", why);
  }

  const gapText = daysSinceLast >= 2 ? `Na ${daysSinceLast} dagen rust` : "Na je vorige training";
  const longThreshold = Math.max(10, (Math.max(...runs42.map((run) => run.distanceM / 1000), 0)) * 0.8);
  const longRecent = runs.some((run) => run.startDate.getTime() >= now.getTime() - 10 * DAY && run.startDate.getTime() <= now.getTime() && run.distanceM / 1000 >= longThreshold);
  const qualityRecent = sorted.some((run) => run.startDate.getTime() >= now.getTime() - 6 * DAY && classifyRun(run) === "interval");
  const freshForQuality = (readiness == null || readiness >= 70) && (loadChangePct == null || loadChangePct <= 15) && daysSinceLast >= 2 && (!last || !isDemanding(last));
  const longest42 = runs42.reduce((max, run) => Math.max(max, run.distanceM / 1000), 0);
  const progressive = pacing != null && (pacing.pattern === "even" || pacing.pattern === "negative") && (pacing.decouplingPct == null || pacing.decouplingPct <= 4) && (pacing.hrDriftPct == null || pacing.hrDriftPct <= 5) && readiness != null && readiness >= 70;

  // returning after a long break: rebuild before anything else
  if (daysSinceLast >= 10 && zones) {
    const factor = daysSinceLast >= 21 ? 0.5 : daysSinceLast >= 14 ? 0.6 : 0.75;
    const lo = Math.max(3, roundHalf(Math.max(3, weekKm * 0.2) * factor)), hi = Math.max(lo + 1, roundHalf(Math.max(5, weekKm * 0.3) * factor));
    return { kind: "easy", title: "Rustig herstarten", detail: `Na ${daysSinceLast} dagen rust: ${range(lo, hi)} km op ${paceRangeText(zones.easy)}, zonder tempoversnelling. Bouw eerst drie runs in een week op voordat je tempo toevoegt.${hrNote}`, why: `${zones.basis}. Fitness zakt na ${Math.round(daysSinceLast / 7)} weken zonder lopen; pezen en spieren herstellen langzamer dan je conditie aanvoelt.`, distanceKm: [lo, hi], paceSec: zones.easy };
  }

  if (zones && runs28.length >= 6 && !longRecent && daysSinceLast >= 2 && longest42 >= 6) {
    const lo = roundHalf(longest42), hi = roundHalf(longest42 + Math.max(1, Math.min(2, longest42 * 0.1)));
    const finish = progressive ? ` Loop het laatste derde 10–15 s/km sneller (${paceRangeText({ fast: zones.long.fast - 15, slow: zones.long.fast - 5 })}); je laatste training liet geen hartslagdrift zien, dus daar is ruimte voor.` : " Houd het tempo gelijk of laat de tweede helft licht versnellen als je hartslag stabiel blijft.";
    return { kind: "long", title: "Lange duurloop", detail: `${gapText}: ${range(lo, hi)} km (ongeveer ${Math.round(lo * zones.long.slow / 60)}–${Math.round(hi * zones.long.slow / 60)} min) op ${paceRangeText(zones.long)}.${finish}${hrNote}`, why: `Je laatste lange loop is langer dan 10 dagen geleden. ${zones.basis}.`, distanceKm: [lo, hi], paceSec: zones.long };
  }

  if (zones?.reliable && runs28.length >= 8 && !qualityRecent && freshForQuality) {
    const layout = sessionLayout(zones, runs28.length, easyMid);
    const total = roundHalf(layout.totalKm);
    return { kind: "quality", title: "Drempeltraining", detail: `${gapText}: 10 min inlopen op ${paceRangeText(zones.easy)} · ${layout.n} × ${layout.min} min op ${formatPaceSec(round5(zones.threshold - 3))}–${formatPaceSec(round5(zones.threshold + 3))}/km met 2 min dribbelen · 10 min uitlopen. Samen ongeveer ${range(Math.max(5, total - 0.5), total + 0.5)} km. Het laatste blok moet even sterk zijn als het eerste.`, why: `${readiness != null ? `Herstelscore ${readiness}/100` : "Je herstel geeft geen waarschuwing"}, geen zware sessie in de laatste zes dagen. ${zones.basis}.`, distanceKm: [Math.max(5, total - 0.5), total + 0.5], paceSec: { fast: zones.threshold - 3, slow: zones.threshold + 3 } };
  }

  if (zones) {
    const lo = enoughData ? Math.min(12, Math.max(4, roundHalf(weekKm * 0.2))) : 4;
    const hi = enoughData ? Math.min(14, Math.max(lo + 1.5, roundHalf(weekKm * 0.3))) : 5.5;
    const justHard = last != null && isDemanding(last) && daysSinceLast <= needed + 1;
    const dLo = justHard ? Math.max(3, roundHalf(lo * 0.7)) : lo, dHi = justHard ? Math.max(dLo + 1, roundHalf(hi * 0.75)) : hi;
    const strides = !justHard && readiness != null && readiness >= 78 ? " Sluit af met 4 × 20 s vlot (strides), telkens met 1 min wandelen." : "";
    return { kind: "easy", title: "Duurloop op gesprekstempo", detail: `${gapText}: ${range(dLo, dHi)} km op ${paceRangeText(zones.easy)}.${strides}${hrNote}`, why: `${zones.basis}.${justHard ? " Je vorige training was zwaar; houd deze loop aan de rustige kant van de zone." : ""}`, distanceKm: [dLo, dHi], paceSec: zones.easy };
  }
  return { kind: "easy", title: "Duurloop op gesprekstempo", detail: `${gapText}: 30–40 min op een tempo waarop je volledige zinnen spreekt.`, why: "Er zijn nog te weinig runs van 4 km of meer in de laatste 12 weken om tempozones uit je cijfers te berekenen.", distanceKm: null, paceSec: null };
}
