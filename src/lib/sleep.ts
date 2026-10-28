import { efficiencyIndex, linkInsight, MIN_SAMPLES, shiftDay, daysApart, amsterdamDay, type LinkInsight, type RunLoad } from "./training-health.ts";

// Pure slaapanalyse op de nachten uit Apple Health (Apple Watch). Een nacht hoort bij de ochtend waarop je wakker werd.
// Elke samenvatting, trend of verband vraagt minimaal MIN_SAMPLES nachten (zie CLAUDE.md); regelmaat en verbanden vragen meer.

export type SleepRow = {
  date: string;
  sleepAsleepMin?: number | null;
  sleepDeepMin?: number | null;
  sleepRemMin?: number | null;
  sleepCoreMin?: number | null;
  sleepAwakeMin?: number | null;
  sleepBedtimeMin?: number | null;
  sleepWakeMin?: number | null;
  hrvMs?: number | null;
  restingHeartRate?: number | null;
};

/** Persoonlijk slaapdoel: 7,5 uur. Onder de 6 uur is een nacht kort. */
export const SLEEP_TARGET_MIN = 450;
export const SLEEP_SHORT_MIN = 360;
export const MIN_REGULARITY_NIGHTS = 5;
const STALE_DAYS = 3;

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const sd = (values: number[]) => { const m = mean(values); return m == null || values.length < 2 ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1)); };
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const round = (value: number, digits = 0) => { const factor = 10 ** digits; return Math.round(value * factor) / factor; };
const nl = (value: number, digits = 0) => value.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 452 → "7 u 32 min". */
export function fmtDuration(minutes: number | null | undefined) {
  if (!finite(minutes)) return "—";
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)} u ${String(total % 60).padStart(2, "0")} min`;
}
/** Opgeslagen inslaapminuten (sinds 18:00) of wekminuten (sinds middernacht) → "23:30". */
export function fmtClock(minutes: number | null | undefined, kind: "bedtime" | "wake") {
  if (!finite(minutes)) return "—";
  const clock = (kind === "bedtime" ? minutes + 18 * 60 : minutes) % 1440;
  return `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(Math.round(clock % 60)).padStart(2, "0")}`;
}

/* ---------- één nacht ---------- */

export type SleepNight = {
  date: string;
  asleepMin: number;
  deepMin: number | null;
  remMin: number | null;
  coreMin: number | null;
  awakeMin: number | null;
  bedtimeMin: number | null;
  wakeMin: number | null;
  /** Slaap ÷ (slaap + wakker): hoeveel van de tijd in bed echt slaap was. Alleen met wakker-minuten. */
  efficiencyPct: number | null;
  deepPct: number | null;
  remPct: number | null;
  score: number | null;
  scoreParts: { label: string; points: number; max: number }[];
  stages: boolean;
};

/**
 * Nachtscore 0–100 uit wat beschikbaar is: duur (50), diepe + REM-aandeel (20), onafgebroken slaap (15) en een
 * inslaaptijd die bij je eigen gewoonte past (15). Ontbrekende onderdelen vallen weg en de rest wordt herschaald.
 */
function scoreNight(night: Omit<SleepNight, "score" | "scoreParts">, usualBedtime: number | null) {
  const parts: SleepNight["scoreParts"] = [];
  parts.push({ label: "Duur", max: 50, points: round(50 * Math.min(1, night.asleepMin / SLEEP_TARGET_MIN), 1) });
  if (night.deepPct != null && night.remPct != null) parts.push({ label: "Diepe slaap en REM", max: 20, points: round(20 * Math.min(1, (night.deepPct + night.remPct) / 38), 1) });
  if (night.efficiencyPct != null) parts.push({ label: "Onafgebroken", max: 15, points: round(15 * Math.min(1, Math.max(0, (night.efficiencyPct - 75) / 15)), 1) });
  if (night.bedtimeMin != null && usualBedtime != null) parts.push({ label: "Vaste inslaaptijd", max: 15, points: round(15 * Math.max(0, 1 - Math.abs(night.bedtimeMin - usualBedtime) / 90), 1) });
  const max = parts.reduce((sum, part) => sum + part.max, 0);
  return { score: Math.round((parts.reduce((sum, part) => sum + part.points, 0) / max) * 100), parts };
}

export function buildSleepNights(rows: SleepRow[]): SleepNight[] {
  const base = rows.filter((row) => finite(row.sleepAsleepMin) && row.sleepAsleepMin > 0).sort((a, b) => a.date.localeCompare(b.date));
  return base.map((row, index) => {
    const asleep = row.sleepAsleepMin!;
    const stages = finite(row.sleepDeepMin) && finite(row.sleepRemMin);
    const awake = finite(row.sleepAwakeMin) ? row.sleepAwakeMin : null;
    const partial: Omit<SleepNight, "score" | "scoreParts"> = {
      date: row.date,
      asleepMin: asleep,
      deepMin: finite(row.sleepDeepMin) ? row.sleepDeepMin : null,
      remMin: finite(row.sleepRemMin) ? row.sleepRemMin : null,
      coreMin: finite(row.sleepCoreMin) ? row.sleepCoreMin : null,
      awakeMin: awake,
      bedtimeMin: finite(row.sleepBedtimeMin) ? row.sleepBedtimeMin : null,
      wakeMin: finite(row.sleepWakeMin) ? row.sleepWakeMin : null,
      efficiencyPct: awake != null ? round((asleep / (asleep + awake)) * 100, 1) : null,
      deepPct: stages ? round((row.sleepDeepMin! / asleep) * 100, 1) : null,
      remPct: stages ? round((row.sleepRemMin! / asleep) * 100, 1) : null,
      stages,
    };
    // Gewoonte = mediane inslaaptijd van de voorgaande 14 nachten; pas vanaf MIN_SAMPLES nachten.
    const earlier = base.slice(Math.max(0, index - 14), index).map((item) => item.sleepBedtimeMin).filter(finite);
    const { score, parts } = scoreNight(partial, earlier.length >= MIN_SAMPLES ? median(earlier) : null);
    return { ...partial, score, scoreParts: parts };
  });
}

/* ---------- samenvatting ---------- */

export type SleepSummary = {
  nights7: number;
  avgAsleep7: number | null;
  avgAsleep28: number | null;
  deltaMin: number | null;
  debtMin: number | null;
  debtNights: number;
  bedtimeSd: number | null;
  wakeSd: number | null;
  avgBedtimeMin: number | null;
  avgWakeMin: number | null;
  deepPct: number | null;
  remPct: number | null;
  efficiencyPct: number | null;
  stageNights: number;
};

const within = (nights: SleepNight[], from: string, to: string) => nights.filter((night) => night.date > from && night.date <= to);

export function summarizeSleep(nights: SleepNight[], today: string): SleepSummary {
  const last7 = within(nights, shiftDay(today, -7), today);
  const prev28 = within(nights, shiftDay(today, -35), shiftDay(today, -7));
  const last14 = within(nights, shiftDay(today, -14), today);
  const avgAsleep7 = last7.length >= MIN_SAMPLES ? round(mean(last7.map((n) => n.asleepMin))!) : null;
  const avgAsleep28 = prev28.length >= MIN_SAMPLES ? round(mean(prev28.map((n) => n.asleepMin))!) : null;
  const bedtimes = last14.map((n) => n.bedtimeMin).filter(finite);
  const wakes = last14.map((n) => n.wakeMin).filter(finite);
  const staged = last14.filter((n) => n.deepPct != null && n.remPct != null);
  const withEff = last14.filter((n) => n.efficiencyPct != null);
  const clockAvg = (values: number[]) => values.length >= MIN_SAMPLES ? round(mean(values)!) : null;
  return {
    nights7: last7.length,
    avgAsleep7,
    avgAsleep28,
    deltaMin: avgAsleep7 != null && avgAsleep28 != null ? avgAsleep7 - avgAsleep28 : null,
    // Slaapschuld: wat je de afgelopen 7 nachten onder je doel bleef, alleen over nachten met data.
    debtMin: last7.length >= MIN_SAMPLES ? round(last7.reduce((sum, n) => sum + Math.max(0, SLEEP_TARGET_MIN - n.asleepMin), 0)) : null,
    debtNights: last7.length,
    bedtimeSd: bedtimes.length >= MIN_REGULARITY_NIGHTS ? round(sd(bedtimes)!) : null,
    wakeSd: wakes.length >= MIN_REGULARITY_NIGHTS ? round(sd(wakes)!) : null,
    avgBedtimeMin: clockAvg(bedtimes),
    avgWakeMin: clockAvg(wakes),
    deepPct: staged.length >= MIN_SAMPLES ? round(mean(staged.map((n) => n.deepPct!))!, 1) : null,
    remPct: staged.length >= MIN_SAMPLES ? round(mean(staged.map((n) => n.remPct!))!, 1) : null,
    efficiencyPct: withEff.length >= MIN_SAMPLES ? round(mean(withEff.map((n) => n.efficiencyPct!))!, 1) : null,
    stageNights: staged.length,
  };
}

/* ---------- verbanden met training en herstel ---------- */

const MIN_PAIRS = 8;

// Slaapduur ↔ HRV van die ochtend (t.o.v. de eigen basis van de 21 dagen ervoor).
function hrvLink(nights: SleepNight[], rows: SleepRow[]): LinkInsight {
  const hrvByDay = new Map(rows.filter((row) => finite(row.hrvMs)).map((row) => [row.date, row.hrvMs!]));
  const points = nights.flatMap((night) => {
    const value = hrvByDay.get(night.date);
    const base: number[] = [];
    for (let back = 1; back <= 21; back++) { const v = hrvByDay.get(shiftDay(night.date, -back)); if (v != null) base.push(v); }
    if (value == null || base.length < 5) return [];
    const avg = mean(base)!;
    return [{ x: round(night.asleepMin / 60, 2), y: round(((value - avg) / avg) * 100, 1), date: night.date }];
  });
  return linkInsight("sleep-vs-hrv", "Slaapduur ↔ HRV de ochtend erna", "Slaap (uren)", "HRV t.o.v. eigen basis (%)", points, (r) =>
    r > 0 ? `Na langere nachten ligt je HRV hoger (r = ${nl(r, 2)}). Slaap is voor jou een directe hefboom op herstel.` : `Na langere nachten ligt je HRV juist lager (r = ${nl(r, 2)}). Dat is ongewoon; kijk of late maaltijden, alcohol of een lange avondrun meespelen.`, MIN_PAIRS);
}

// Slaap van de nacht ervoor ↔ zuinigheid van rustige runs op die dag.
function efficiencyLink(nights: SleepNight[], loads: RunLoad[]): LinkInsight {
  const index = efficiencyIndex(loads);
  const byDay = new Map(nights.map((night) => [night.date, night]));
  const points = loads.flatMap((run) => { const night = byDay.get(run.day); const value = index.get(run.id); return night && value != null ? [{ x: round(night.asleepMin / 60, 2), y: value, date: run.day }] : []; });
  return linkInsight("sleep-vs-efficiency", "Slaap ervoor ↔ zuinig lopen", "Slaap de nacht ervoor (uren)", "Zuinigheidsindex", points, (r) =>
    r > 0 ? `Na meer slaap loop je zuiniger (r = ${nl(r, 2)}). Bescherm de nacht voor kwaliteitstrainingen en je lange duurloop.` : `Na meer slaap loop je juist minder zuinig (r = ${nl(r, 2)}). Slaapduur verklaart je prestatie bij jou dus niet; kijk naar andere factoren.`, MIN_PAIRS);
}

export type SleepAfterLoad = { enough: boolean; hardAvg: number | null; easyAvg: number | null; hardNights: number; easyNights: number; text: string };

// Hoe slaap je na een zware dag? Vergelijk de nacht na je zwaarste derde loopdagen met de nacht na rust- of lichte dagen.
export function sleepAfterLoad(nights: SleepNight[], loads: RunLoad[]): SleepAfterLoad {
  const dayLoad = new Map<string, number>();
  for (const run of loads) dayLoad.set(run.day, (dayLoad.get(run.day) ?? 0) + run.load);
  const runLoads = [...dayLoad.values()].sort((a, b) => a - b);
  if (runLoads.length < 9) return { enough: false, hardAvg: null, easyAvg: null, hardNights: 0, easyNights: 0, text: "Nog te weinig loopdagen om te zien hoe je na zware dagen slaapt." };
  const high = runLoads[Math.floor((runLoads.length * 2) / 3)];
  const hard: number[] = []; const easy: number[] = [];
  for (const night of nights) {
    const load = dayLoad.get(shiftDay(night.date, -1)) ?? 0;
    if (load > 0 && load >= high) hard.push(night.asleepMin); else if (load < high) easy.push(night.asleepMin);
  }
  if (hard.length < MIN_SAMPLES || easy.length < MIN_SAMPLES) return { enough: false, hardAvg: null, easyAvg: null, hardNights: hard.length, easyNights: easy.length, text: `Te weinig nachten na zware dagen (${hard.length}) of rustige dagen (${easy.length}) voor een eerlijke vergelijking.` };
  const hardAvg = round(mean(hard)!); const easyAvg = round(mean(easy)!);
  const diff = hardAvg - easyAvg;
  const text = Math.abs(diff) < 15 ? `Na een zware dag slaap je evenveel als na een rustige dag (${fmtDuration(hardAvg)} tegen ${fmtDuration(easyAvg)}). Je slaap loopt niet mee met je belasting.`
    : diff > 0 ? `Na een zware dag slaap je ${nl(diff)} minuten langer (${fmtDuration(hardAvg)} tegen ${fmtDuration(easyAvg)}). Je lichaam vraagt zelf om herstel.`
    : `Na een zware dag slaap je ${nl(Math.abs(diff))} minuten korter (${fmtDuration(hardAvg)} tegen ${fmtDuration(easyAvg)}). Zware dagen kosten je slaap, vooral als je laat loopt; plan de zware sessie eerder op de dag.`;
  return { enough: true, hardAvg, easyAvg, hardNights: hard.length, easyNights: easy.length, text };
}

/* ---------- advies ---------- */

export type SleepAdvice = { id: string; tone: "good" | "warning" | "critical"; title: string; detail: string };

type AdviceInput = { nights: SleepNight[]; summary: SleepSummary; latest: SleepNight | null; latestAgeDays: number | null; balanceRatio: number | null; links: LinkInsight[]; afterLoad: SleepAfterLoad };

export function buildSleepAdvice({ summary, latest, latestAgeDays, balanceRatio, links, afterLoad }: AdviceInput): SleepAdvice[] {
  const out: SleepAdvice[] = [];
  if (!latest || latestAgeDays == null) return out;
  if (latestAgeDays > STALE_DAYS) {
    return [{ id: "stale", tone: "warning", title: "Je slaapdata is verouderd", detail: `De laatste nacht is ${latestAgeDays} dagen geleden binnengekomen. Draai de Opdracht \"Pulse slaap-sync\" om weer actueel te worden; tot die tijd geef ik geen advies voor vandaag.` }];
  }
  const lastShort = latest.asleepMin < SLEEP_SHORT_MIN;
  const heavyLoad = balanceRatio != null && balanceRatio > 1.3;
  if (lastShort) out.push({ id: "short-night", tone: "critical", title: `Korte nacht: ${fmtDuration(latest.asleepMin)}`, detail: "Plan vandaag geen interval of lange duurloop. Loop maximaal rustig en kort, of rust. Probeer vanavond een uur eerder te gaan slapen." });
  else if (latest.asleepMin < SLEEP_TARGET_MIN - 45) out.push({ id: "light-night", tone: "warning", title: `Iets te weinig geslapen (${fmtDuration(latest.asleepMin)})`, detail: "Een geplande kwaliteitstraining kan, maar houd de warming-up langer en breek af als je benen zwaar voelen." });
  if (summary.debtMin != null && summary.debtMin >= 120) {
    out.push({ id: "debt", tone: summary.debtMin >= 240 ? "critical" : "warning", title: `Slaapschuld van ${fmtDuration(summary.debtMin)} deze week`, detail: heavyLoad ? "Een slaapschuld bovenop een trainingsweek die zwaarder is dan normaal is de combinatie waarin blessures en ziekte ontstaan. Haal een training eruit of maak hem rustiger." : "Haal dit in met één of twee nachten van 8 uur. Een uurtje extra per nacht werkt beter dan één lange uitslaapdag." });
  }
  if (summary.bedtimeSd != null && summary.bedtimeSd > 60) out.push({ id: "bedtime", tone: "warning", title: `Wisselende inslaaptijd (±${nl(summary.bedtimeSd)} min)`, detail: "Je inslaaptijd verschilt gemiddeld meer dan een uur van nacht tot nacht. Kies een vast tijdstip en wijk er hooguit een half uur van af, ook in het weekend." });
  if (summary.deepPct != null && summary.deepPct < 10) out.push({ id: "deep", tone: "warning", title: `Weinig diepe slaap (${nl(summary.deepPct, 1)}%)`, detail: "Diepe slaap is waar je lichaam fysiek herstelt. Alcohol, een late zware maaltijd of een warme slaapkamer drukken het. Dit is een schatting van je Watch; kijk naar het patroon over weken." });
  if (summary.remPct != null && summary.remPct < 15) out.push({ id: "rem", tone: "warning", title: `Weinig REM-slaap (${nl(summary.remPct, 1)}%)`, detail: "REM-slaap komt vooral in het laatste deel van de nacht. Een te vroege wekker of te korte nacht kost het eerst." });
  if (summary.efficiencyPct != null && summary.efficiencyPct < 85) out.push({ id: "awake", tone: "warning", title: `Veel wakker liggen (efficiëntie ${nl(summary.efficiencyPct, 1)}%)`, detail: "Je ligt relatief veel wakker in bed. Cafeïne na de middag, schermen vlak voor het slapen en een te warme kamer zijn de gebruikelijke oorzaken." });
  const hrv = links.find((link) => link.id === "sleep-vs-hrv");
  if (hrv?.verdict === "verband" && hrv.r != null && hrv.r > 0) out.push({ id: "hrv-link", tone: "good", title: "Jouw herstel hangt aan je slaap", detail: `In jouw data gaat meer slaap samen met een hogere HRV de ochtend erna (r = ${nl(hrv.r, 2)}). Zet slaap daarom vóór een zware sessie op de eerste plaats.` });
  const eff = links.find((link) => link.id === "sleep-vs-efficiency");
  if (eff?.verdict === "verband" && eff.r != null && eff.r > 0) out.push({ id: "eff-link", tone: "good", title: "Je loopt zuiniger na meer slaap", detail: "Beschermen van de nacht voor je kwaliteitstrainingen en lange duurloop loont voor jou aantoonbaar." });
  if (afterLoad.enough && afterLoad.hardAvg != null && afterLoad.easyAvg != null && afterLoad.hardAvg - afterLoad.easyAvg <= -30) out.push({ id: "after-load", tone: "warning", title: "Zware dagen kosten je slaap", detail: afterLoad.text });
  if (out.every((item) => item.tone === "good") && !lastShort && summary.avgAsleep7 != null && summary.avgAsleep7 >= SLEEP_TARGET_MIN - 15) out.unshift({ id: "ok", tone: "good", title: "Je slaap ondersteunt je training", detail: `Gemiddeld ${fmtDuration(summary.avgAsleep7)} per nacht de afgelopen week. Houd je ritme vast.` });
  if (out.length === 0) out.push({ id: "none", tone: "good", title: "Geen aandachtspunten", detail: "Er staat niets op dat vandaag je training hoeft te veranderen. Zodra er meer nachten binnen zijn, worden de adviezen scherper." });
  return out;
}

/* ---------- alles bijeen voor de pagina ---------- */

export function buildSleepReport(rows: SleepRow[], loads: RunLoad[], balanceRatio: number | null, now = new Date()) {
  const today = amsterdamDay(now);
  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const nights = buildSleepNights(sortedRows);
  const latest = nights.at(-1) ?? null;
  const latestAgeDays = latest ? daysApart(today, latest.date) : null;
  const summary = summarizeSleep(nights, today);
  const afterLoad = sleepAfterLoad(nights, loads);
  const links = [hrvLink(nights, sortedRows), efficiencyLink(nights, loads)];
  return { today, nights, latest, latestAgeDays, summary, afterLoad, links, advice: buildSleepAdvice({ nights, summary, latest, latestAgeDays, balanceRatio, links, afterLoad }) };
}
