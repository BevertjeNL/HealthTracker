import { classifyRun, toAnalysisRun, type AnalysisRun, type RunKind } from "./run-analysis.ts";

// Pure koppeling tussen Strava-runs en Apple Health. Alles hier werkt op kalenderdagen
// (yyyy-MM-dd, Europe/Amsterdam) en geeft nooit een gemiddelde of verband uit minder dan
// MIN_SAMPLES meetpunten (zie CLAUDE.md: minimale steekproef).

export const MIN_SAMPLES = 3;
export const MIN_CORRELATION_PAIRS = 8;
const DAY = 86_400_000;

type RunRow = Parameters<typeof toAnalysisRun>[0];
export type HealthRow = {
  date: string;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  vo2Max?: number | null;
  steps?: number | null;
  activeEnergyKcal?: number | null;
  exerciseMinutes?: number | null;
  weightKg?: number | null;
  respiratoryRate?: number | null;
  oxygenSaturationPct?: number | null;
  runningPowerW?: number | null;
  runningStrideLengthM?: number | null;
  runningVerticalOscillationCm?: number | null;
  runningGroundContactTimeMs?: number | null;
};
export type HealthKey = Exclude<keyof HealthRow, "date">;

/* ---------- datum-hulpjes ---------- */

export const amsterdamDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const dayMs = (date: string) => new Date(`${date}T12:00:00Z`).getTime();
export const shiftDay = (date: string, days: number) => new Date(dayMs(date) + days * DAY).toISOString().slice(0, 10);
export const daysApart = (later: string, earlier: string) => Math.round((dayMs(later) - dayMs(earlier)) / DAY);
const isoWeekStart = (date: string) => { const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; return shiftDay(date, -weekday); };

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const round = (value: number, digits = 1) => { const factor = 10 ** digits; return Math.round(value * factor) / factor; };

/* ---------- belasting per run ---------- */

export type RunLoad = {
  id: number;
  day: string;
  name: string;
  kind: RunKind;
  km: number;
  minutes: number;
  avgHr: number | null;
  paceMinPerKm: number | null;
  load: number;
  loadBasis: "hartslag" | "geschat";
  efficiency: number | null; // meter per hartslag; hoger = zuiniger
  watts: number | null;
};

type HrProfile = { rest: number; max: number };

// Banister-TRIMP: minuten × hartslagreserve × exponentiële weging. Zonder hartslag nemen we de
// mediane intensiteit van de eigen runs, zodat een run zonder meting niet op nul valt.
function trimp(minutes: number, hr: number, profile: HrProfile) {
  const reserve = Math.min(1, Math.max(0, (hr - profile.rest) / (profile.max - profile.rest)));
  return minutes * reserve * 0.64 * Math.exp(1.92 * reserve);
}

export function hrProfile(runs: AnalysisRun[], health: HealthRow[]): HrProfile | null {
  const rest = median([...health].sort((a, b) => a.date.localeCompare(b.date)).map((row) => row.restingHeartRate).filter(finite).slice(-60));
  const observedMax = Math.max(0, ...runs.map((run) => run.maxHr ?? 0));
  if (rest == null || observedMax < 140 || observedMax - rest < 40) return null;
  return { rest, max: observedMax };
}

export function buildRunLoads(rows: RunRow[], health: HealthRow[]): RunLoad[] {
  const runs = rows.map(toAnalysisRun).filter((run) => run.distanceM >= 1000 && run.movingTimeS >= 300);
  // Max-hartslag en typische intensiteit komen uit de laatste 400 dagen, zodat elke pagina dezelfde belasting toont
  // ongeacht hoeveel geschiedenis ze laadt.
  const newest = Math.max(0, ...runs.map((run) => run.startDate.getTime()));
  const recentRuns = runs.filter((run) => run.startDate.getTime() >= newest - 400 * DAY);
  const profile = hrProfile(recentRuns, health);
  const withHr = profile ? recentRuns.filter((run) => run.avgHr != null && run.avgHr > profile.rest) : [];
  const perMinute = withHr.map((run) => trimp(1, run.avgHr!, profile!));
  const typical = median(perMinute);
  return runs.map((run) => {
    const minutes = run.movingTimeS / 60;
    const measured = profile && run.avgHr != null && run.avgHr > profile.rest;
    const load = measured ? trimp(minutes, run.avgHr!, profile) : typical != null ? minutes * typical : minutes * 0.9;
    const speed = run.distanceM / (run.movingTimeS / 60);
    const watts = typeof run.raw.average_watts === "number" && run.raw.average_watts > 0 ? run.raw.average_watts : null;
    return { id: run.id, day: amsterdamDay(run.startDate), name: run.name, kind: classifyRun(run), km: run.distanceM / 1000, minutes, avgHr: run.avgHr, paceMinPerKm: run.paceMinPerKm, load: round(load, 0), loadBasis: measured ? "hartslag" as const : "geschat" as const, efficiency: run.avgHr != null && run.avgHr > 60 ? round(speed / run.avgHr, 3) : null, watts };
  }).sort((a, b) => a.day.localeCompare(b.day));
}

/* ---------- dagreeks en weekreeks ---------- */

export type DayPoint = { date: string; km: number; load: number; acute: number | null; chronic: number | null; hrv: number | null; rhr: number | null; steps: number | null; exerciseMin: number | null; weightKg: number | null };

// Acuut = som van 7 dagen. Chronisch = gemiddelde weekbelasting over 28 dagen. Verhouding pas na 28 dagen geschiedenis.
export function buildDaySeries(loads: RunLoad[], health: HealthRow[], today: string, days = 120): DayPoint[] {
  const byDay = new Map<string, { km: number; load: number }>();
  for (const run of loads) { const entry = byDay.get(run.day) ?? { km: 0, load: 0 }; entry.km += run.km; entry.load += run.load; byDay.set(run.day, entry); }
  const healthByDay = new Map(health.map((row) => [row.date, row]));
  const firstRun = loads[0]?.day ?? today;
  const loadOn = (date: string) => byDay.get(date)?.load ?? 0;
  const out: DayPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = shiftDay(today, -offset);
    const row = healthByDay.get(date);
    let acute = 0; let chronic = 0;
    for (let back = 0; back < 28; back++) { const value = loadOn(shiftDay(date, -back)); chronic += value; if (back < 7) acute += value; }
    const enoughHistory = daysApart(date, firstRun) >= 28;
    out.push({ date, km: round(byDay.get(date)?.km ?? 0, 2), load: round(loadOn(date), 0), acute: enoughHistory ? round(acute, 0) : null, chronic: enoughHistory ? round(chronic / 4, 0) : null, hrv: row?.hrvMs ?? null, rhr: row?.restingHeartRate ?? null, steps: row?.steps ?? null, exerciseMin: row?.exerciseMinutes ?? null, weightKg: row?.weightKg ?? null });
  }
  return out;
}

export type WeekPoint = { weekStart: string; km: number; runs: number; load: number; hrv: number | null; rhr: number | null; longestKm: number };

export function buildWeekSeries(loads: RunLoad[], health: HealthRow[], today: string, weeks = 16): WeekPoint[] {
  const thisWeek = isoWeekStart(today);
  const out: WeekPoint[] = [];
  for (let back = weeks - 1; back >= 0; back--) {
    const start = shiftDay(thisWeek, -back * 7);
    const end = shiftDay(start, 6);
    const runs = loads.filter((run) => run.day >= start && run.day <= end);
    const rows = health.filter((row) => row.date >= start && row.date <= end);
    const hrv = rows.map((row) => row.hrvMs).filter(finite);
    const rhr = rows.map((row) => row.restingHeartRate).filter(finite);
    out.push({ weekStart: start, km: round(runs.reduce((sum, run) => sum + run.km, 0), 1), runs: runs.length, load: round(runs.reduce((sum, run) => sum + run.load, 0), 0), hrv: hrv.length >= MIN_SAMPLES ? round(mean(hrv)!, 0) : null, rhr: rhr.length >= MIN_SAMPLES ? round(mean(rhr)!, 0) : null, longestKm: round(Math.max(0, ...runs.map((run) => run.km)), 1) });
  }
  return out;
}

export type LoadBalance = { acute: number; chronic: number | null; ratio: number | null; tone: "good" | "warning" | "critical" | "unknown"; label: string; detail: string };

export function loadBalance(series: DayPoint[]): LoadBalance {
  const last = series.at(-1);
  if (!last || last.acute == null || last.chronic == null || last.chronic <= 0) return { acute: last?.acute ?? 0, chronic: last?.chronic ?? null, ratio: null, tone: "unknown", label: "Basis wordt opgebouwd", detail: "Er is nog geen 28 dagen loopgeschiedenis voor een betrouwbare belastingverhouding." };
  const ratio = round(last.acute / last.chronic, 2);
  if (ratio > 1.5) return { acute: last.acute, chronic: last.chronic, ratio, tone: "critical", label: "Veel meer dan je gewend bent", detail: "Je laatste 7 dagen zijn zwaarder dan anderhalf keer je normale week. Dat is de zone waar overbelasting ontstaat." };
  if (ratio > 1.3) return { acute: last.acute, chronic: last.chronic, ratio, tone: "warning", label: "Boven je normale week", detail: "Je zit boven je gewone belasting. Houd de komende dagen rustig of laat een dag weg." };
  if (ratio < 0.7) return { acute: last.acute, chronic: last.chronic, ratio, tone: "warning", label: "Onder je normale week", detail: "Je belasting zakt weg. Prima voor een taper of herstel, anders is het tijd om rustig op te bouwen." };
  return { acute: last.acute, chronic: last.chronic, ratio, tone: "good", label: "In balans", detail: "Je laatste 7 dagen liggen dicht bij je normale week: een veilige zone om te trainen." };
}

/* ---------- Health-trends ten opzichte van eigen basislijn ---------- */

export type HealthTrend = {
  key: HealthKey;
  label: string;
  unit: string;
  current: number | null;
  currentAgeDays: number | null;
  baseline: number | null;
  deltaPct: number | null;
  samples: number;
  /** "better" = goede kant op voor een loper, "worse" = verkeerde kant op, "flat" = binnen ruis. */
  direction: "better" | "worse" | "flat" | "changed" | "unknown";
  series: { date: string; value: number | null }[];
};

type Spec = { label: string; unit: string; higherIsBetter: boolean | null; digits: number; noise: number; recent?: number; baseline?: number; maxAge?: number };
const TREND_SPEC: Record<string, Spec> = {
  hrvMs: { label: "HRV", unit: "ms", higherIsBetter: true, digits: 0, noise: 5 },
  restingHeartRate: { label: "Rusthartslag", unit: "bpm", higherIsBetter: false, digits: 0, noise: 2.5 },
  vo2Max: { label: "VO₂max", unit: "ml/kg/min", higherIsBetter: true, digits: 1, noise: 1, recent: 30, baseline: 90, maxAge: 45 },
  weightKg: { label: "Gewicht", unit: "kg", higherIsBetter: null, digits: 1, noise: 0.8, recent: 14, baseline: 60, maxAge: 30 },
  steps: { label: "Stappen", unit: "per dag", higherIsBetter: null, digits: 0, noise: 10 },
  exerciseMinutes: { label: "Trainingsminuten", unit: "per dag", higherIsBetter: null, digits: 0, noise: 10 },
  respiratoryRate: { label: "Ademhaling", unit: "per min", higherIsBetter: false, digits: 1, noise: 4 },
  oxygenSaturationPct: { label: "Zuurstof", unit: "%", higherIsBetter: true, digits: 1, noise: 1 },
  runningPowerW: { label: "Loopvermogen", unit: "W", higherIsBetter: null, digits: 0, noise: 3 , recent: 28, baseline: 84, maxAge: 60 },
  runningStrideLengthM: { label: "Pasbreedte", unit: "m", higherIsBetter: null, digits: 2, noise: 3 , recent: 28, baseline: 84, maxAge: 60 },
  runningGroundContactTimeMs: { label: "Grondcontact", unit: "ms", higherIsBetter: false, digits: 0, noise: 3 , recent: 28, baseline: 84, maxAge: 60 },
  runningVerticalOscillationCm: { label: "Verticale beweging", unit: "cm", higherIsBetter: false, digits: 1, noise: 4 , recent: 28, baseline: 84, maxAge: 60 },
};
export const trendSpec = (key: HealthKey) => TREND_SPEC[key];

// "Huidig" = gemiddelde van de laatste `recentDays` met data; basislijn = de `baselineDays` daarvoor.
// Ook als de laatste sync enkele dagen oud is tonen we de nieuwste waarde, met expliciete leeftijd.
export function healthTrend(rows: HealthRow[], key: HealthKey, today: string, opts: { recentDays?: number; baselineDays?: number; seriesDays?: number } = {}): HealthTrend {
  const spec = TREND_SPEC[key];
  const recentDays = opts.recentDays ?? spec.recent ?? 7;
  const baselineDays = opts.baselineDays ?? spec.baseline ?? 28;
  const valid = rows.filter((row) => finite(row[key]) && row.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1);
  const windowEnd = latest && daysApart(today, latest.date) <= (spec.maxAge ?? 14) ? latest.date : null;
  const recent = windowEnd ? valid.filter((row) => row.date > shiftDay(windowEnd, -recentDays) && row.date <= windowEnd) : [];
  const base = windowEnd ? valid.filter((row) => row.date <= shiftDay(windowEnd, -recentDays) && row.date > shiftDay(windowEnd, -recentDays - baselineDays)) : [];
  const current = recent.length >= 1 ? mean(recent.map((row) => row[key] as number)) : null;
  const baseline = base.length >= MIN_SAMPLES ? mean(base.map((row) => row[key] as number)) : null;
  const deltaPct = current != null && baseline ? round(((current - baseline) / baseline) * 100, 1) : null;
  let direction: HealthTrend["direction"] = "unknown";
  if (deltaPct != null) {
    if (Math.abs(deltaPct) < spec.noise) direction = "flat";
    else if (spec.higherIsBetter == null) direction = "changed";
    else direction = (deltaPct > 0) === spec.higherIsBetter ? "better" : "worse";
  }
  const from = shiftDay(today, -(opts.seriesDays ?? 90));
  const series = valid.filter((row) => row.date >= from).map((row) => ({ date: row.date, value: row[key] as number }));
  return { key, label: spec.label, unit: spec.unit, current: current == null ? null : round(current, spec.digits), currentAgeDays: latest ? daysApart(today, latest.date) : null, baseline: baseline == null ? null : round(baseline, spec.digits), deltaPct, samples: recent.length + base.length, direction, series };
}

/* ---------- fitness: loop je zuiniger? ---------- */

// Zuinigheidsindex: meter per hartslag gedeeld door de mediaan van hetzelfde runtype (100 = typisch voor dat type).
// Zo tellen duurlopen én intervaltrainingen mee zonder dat ze met elkaar vergeleken worden. Wedstrijden vallen af.
export function efficiencyIndex(loads: RunLoad[]) {
  const eligible = loads.filter((run) => run.kind !== "race" && run.efficiency != null && run.km >= 4);
  const medians = new Map<RunKind, number>();
  for (const kind of new Set(eligible.map((run) => run.kind))) {
    const values = eligible.filter((run) => run.kind === kind).map((run) => run.efficiency!);
    if (values.length >= MIN_SAMPLES) medians.set(kind, median(values)!);
  }
  return new Map(eligible.flatMap((run) => medians.has(run.kind) ? [[run.id, round((run.efficiency! / medians.get(run.kind)!) * 100, 1)] as const] : []));
}

export type FitnessTrend = {
  efficiency: { recent: number | null; previous: number | null; deltaPct: number | null; slopePct90: number | null; recentRuns: number; previousRuns: number; series: { date: string; value: number; name: string }[] };
  verdict: { tone: "good" | "warning" | "unknown"; label: string; detail: string };
};

// Vergelijk de zuinigheidsindex van de laatste 60 dagen met de 60 dagen daarvoor.
// Hitte en hoogteverschil blijven ruis.
export function buildFitnessTrend(loads: RunLoad[], today: string): FitnessTrend {
  const index = efficiencyIndex(loads);
  const steady = loads.filter((run) => index.has(run.id));
  const recent = steady.filter((run) => run.day > shiftDay(today, -60) && run.day <= today);
  const previous = steady.filter((run) => run.day > shiftDay(today, -120) && run.day <= shiftDay(today, -60));
  const recentValue = recent.length >= MIN_SAMPLES ? median(recent.map((run) => index.get(run.id)!)) : null;
  const previousValue = previous.length >= MIN_SAMPLES ? median(previous.map((run) => index.get(run.id)!)) : null;
  const deltaPct = recentValue != null && previousValue ? round(((recentValue - previousValue) / previousValue) * 100, 1) : null;
  const series = steady.filter((run) => run.day > shiftDay(today, -240)).map((run) => ({ date: run.day, value: index.get(run.id)!, name: run.name }));
  // Zonder twee volle vensters: de helling door alle rustige runs van het afgelopen half jaar, uitgedrukt per 90 dagen.
  let slopePct90: number | null = null;
  const lately = steady.filter((run) => run.day > shiftDay(today, -180));
  if (deltaPct == null && lately.length >= 8 && daysApart(lately.at(-1)!.day, lately[0].day) >= 60) {
    const points = lately.map((run) => ({ x: daysApart(run.day, lately[0].day), y: index.get(run.id)! }));
    const mx = mean(points.map((p) => p.x))!; const my = mean(points.map((p) => p.y))!;
    const sxx = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0);
    if (sxx > 0) slopePct90 = round(((points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / sxx) * 90 / my) * 100, 1);
  }
  let verdict: FitnessTrend["verdict"] = { tone: "unknown", label: "Nog geen fitnesstrend", detail: "Voor een betrouwbare vergelijking zijn minstens drie runs met hartslag nodig in zowel de laatste als de voorgaande twee maanden." };
  if (deltaPct != null) {
    if (deltaPct >= 2) verdict = { tone: "good", label: "Je loopt zuiniger", detail: `Per hartslag leg je gemiddeld ${deltaPct.toLocaleString("nl-NL")}% meer afstand af dan in de twee maanden ervoor, binnen hetzelfde runtype. Je aerobe motor wordt beter.` };
    else if (deltaPct <= -2) verdict = { tone: "warning", label: "Je loopt minder zuinig", detail: `Per hartslag leg je ${Math.abs(deltaPct).toLocaleString("nl-NL")}% minder afstand af. Denk aan vermoeidheid, warm weer of opgebouwde belasting voordat je conclusies trekt.` };
    else verdict = { tone: "good", label: "Stabiele fitness", detail: "Je tempo-bij-hartslag is gelijk gebleven; je aerobe basis houdt stand." };
  }
  if (deltaPct == null && slopePct90 != null) {
    if (slopePct90 >= 2) verdict = { tone: "good", label: "Je loopt gestaag zuiniger", detail: `Over je runs van het afgelopen half jaar stijgt je afstand per hartslag met ongeveer ${slopePct90.toLocaleString("nl-NL")}% per drie maanden.` };
    else if (slopePct90 <= -2) verdict = { tone: "warning", label: "Je loopt minder zuinig", detail: `Over het afgelopen half jaar daalt je afstand per hartslag met ongeveer ${Math.abs(slopePct90).toLocaleString("nl-NL")}% per drie maanden. Kijk naar vermoeidheid, warmte en belasting.` };
    else verdict = { tone: "good", label: "Stabiele fitness", detail: "Over het afgelopen half jaar is je afstand per hartslag ongeveer gelijk gebleven." };
  }
  return { efficiency: { recent: recentValue, previous: previousValue, deltaPct, slopePct90, recentRuns: recent.length, previousRuns: previous.length, series }, verdict };
}

/* ---------- hoe reageert jouw lichaam op belasting? ---------- */

export type ResponseBucket = { label: string; runs: number; hrvDeltaPct: number | null; rhrDeltaPct: number | null; hrvSamples: number; rhrSamples: number };
export type ResponseProfile = { buckets: ResponseBucket[]; enough: boolean; summary: string; recoveryDays: number | null };

function baselineBefore(rows: Map<string, HealthRow>, key: "hrvMs" | "restingHeartRate", date: string) {
  const values: number[] = [];
  for (let back = 1; back <= 21; back++) { const value = rows.get(shiftDay(date, -back))?.[key]; if (finite(value)) values.push(value); }
  return values.length >= 5 ? mean(values) : null;
}

// Per belastingklasse: wat doen HRV en rusthartslag de ochtend na de run, ten opzichte van de eigen basislijn?
export function buildResponseProfile(loads: RunLoad[], health: HealthRow[]): ResponseProfile {
  const byDay = new Map(health.map((row) => [row.date, row]));
  const dayLoad = new Map<string, number>();
  for (const run of loads) dayLoad.set(run.day, (dayLoad.get(run.day) ?? 0) + run.load);
  const loadValues = [...dayLoad.values()];
  const sorted = [...loadValues].sort((a, b) => a - b);
  if (sorted.length < 9) return { buckets: [], enough: false, summary: "Nog te weinig loopdagen met Health-data om te zien hoe je lichaam op belasting reageert.", recoveryDays: null };
  const low = sorted[Math.floor(sorted.length / 3)];
  const high = sorted[Math.floor((sorted.length * 2) / 3)];
  const groups: Record<string, { hrv: number[]; rhr: number[]; runs: number }> = { Licht: { hrv: [], rhr: [], runs: 0 }, Gemiddeld: { hrv: [], rhr: [], runs: 0 }, Zwaar: { hrv: [], rhr: [], runs: 0 } };
  const recoveryLags: number[] = [];
  for (const [day, load] of dayLoad) {
    const group = groups[load >= high && load > low ? "Zwaar" : load <= low ? "Licht" : "Gemiddeld"];
    group.runs += 1;
    const baseHrv = baselineBefore(byDay, "hrvMs", day);
    const baseRhr = baselineBefore(byDay, "restingHeartRate", day);
    const next = byDay.get(shiftDay(day, 1));
    if (baseHrv && finite(next?.hrvMs)) group.hrv.push(((next.hrvMs - baseHrv) / baseHrv) * 100);
    if (baseRhr && finite(next?.restingHeartRate)) group.rhr.push(((next.restingHeartRate - baseRhr) / baseRhr) * 100);
    if (load > high && baseHrv) {
      for (let lag = 1; lag <= 5; lag++) { const value = byDay.get(shiftDay(day, lag))?.hrvMs; if (finite(value) && value >= baseHrv * 0.95) { recoveryLags.push(lag); break; } if (lag === 5) recoveryLags.push(6); }
    }
  }
  const buckets: ResponseBucket[] = Object.entries(groups).map(([label, group]) => ({ label, runs: group.runs, hrvSamples: group.hrv.length, rhrSamples: group.rhr.length, hrvDeltaPct: group.hrv.length >= MIN_SAMPLES ? round(mean(group.hrv)!, 1) : null, rhrDeltaPct: group.rhr.length >= MIN_SAMPLES ? round(mean(group.rhr)!, 1) : null }));
  const hard = buckets.find((bucket) => bucket.label === "Zwaar");
  const light = buckets.find((bucket) => bucket.label === "Licht");
  const enough = buckets.some((bucket) => bucket.hrvDeltaPct != null || bucket.rhrDeltaPct != null);
  const recoveryDays = recoveryLags.length >= MIN_SAMPLES ? round(median(recoveryLags)!, 0) : null;
  let summary = "Nog te weinig metingen na je runs om een eigen herstelprofiel te tonen.";
  if (hard?.hrvDeltaPct != null) {
    const drop = hard.hrvDeltaPct;
    const baseNote = light?.hrvDeltaPct != null ? ` Na een lichte run is dat ${light.hrvDeltaPct > 0 ? "+" : ""}${light.hrvDeltaPct.toLocaleString("nl-NL")}%.` : "";
    summary = drop <= -8 ? `Na een zware run zakt je HRV de ochtend erna gemiddeld ${Math.abs(drop).toLocaleString("nl-NL")}%.${baseNote} Je lichaam voelt zware dagen duidelijk; geef ze echt een rustige dag erna.` : drop <= -3 ? `Na een zware run zakt je HRV de ochtend erna licht (${drop.toLocaleString("nl-NL")}%).${baseNote} Je herstelt snel, maar twee zware dagen achter elkaar blijven een risico.` : `Zware runs laten je HRV de ochtend erna nauwelijks zakken (${drop > 0 ? "+" : ""}${drop.toLocaleString("nl-NL")}%).${baseNote} Je lichaam verwerkt je huidige belasting goed.`;
  }
  return { buckets, enough, summary, recoveryDays };
}

/* ---------- is er een verband tussen Health en je prestatie? ---------- */

export type LinkInsight = { id: string; title: string; pairs: number; r: number | null; verdict: "verband" | "geen-verband" | "onvoldoende"; text: string; points: { x: number; y: number; date: string }[]; xLabel: string; yLabel: string };

export function pearson(pairs: { x: number; y: number }[]) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = mean(pairs.map((p) => p.x))!;
  const my = mean(pairs.map((p) => p.y))!;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const p of pairs) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function linkInsight(id: string, title: string, xLabel: string, yLabel: string, points: { x: number; y: number; date: string }[], describe: (r: number) => string, minPairs = MIN_CORRELATION_PAIRS): LinkInsight {
  const r = points.length >= minPairs ? pearson(points) : null;
  if (r == null) return { id, title, pairs: points.length, r: null, verdict: "onvoldoende", text: `Nog te weinig gekoppelde metingen (${points.length} van minimaal ${minPairs}) om dit eerlijk te beoordelen.`, points, xLabel, yLabel };
  if (Math.abs(r) < 0.25) return { id, title, pairs: points.length, r: round(r, 2), verdict: "geen-verband", text: `Geen duidelijk verband gevonden in ${points.length} runs. Dit is geen probleem: je prestatie hangt hier niet merkbaar van af.`, points, xLabel, yLabel };
  return { id, title, pairs: points.length, r: round(r, 2), verdict: "verband", text: describe(r), points, xLabel, yLabel };
}

// Koppel de ochtend-HRV, de rusthartslag en het gewicht aan de zuinigheid van rustige runs.
export function buildLinkInsights(loads: RunLoad[], health: HealthRow[]): LinkInsight[] {
  const index = efficiencyIndex(loads);
  const steady = loads.filter((run) => index.has(run.id));
  const byDay = new Map(health.map((row) => [row.date, row]));
  const ofDayOrBefore = (key: "hrvMs" | "restingHeartRate", day: string) => { for (let back = 0; back <= 1; back++) { const value = byDay.get(shiftDay(day, -back))?.[key]; if (finite(value)) return value; } return null; };
  const hrvPoints = steady.flatMap((run) => { const base = baselineBefore(byDay, "hrvMs", run.day); const value = ofDayOrBefore("hrvMs", run.day); return base && value != null ? [{ x: round(((value - base) / base) * 100, 1), y: index.get(run.id)!, date: run.day }] : []; });
  const rhrPoints = steady.flatMap((run) => { const base = baselineBefore(byDay, "restingHeartRate", run.day); const value = ofDayOrBefore("restingHeartRate", run.day); return base && value != null ? [{ x: round(((value - base) / base) * 100, 1), y: index.get(run.id)!, date: run.day }] : []; });
  const weights = health.filter((row) => finite(row.weightKg)).map((row) => ({ date: row.date, kg: row.weightKg as number }));
  const weightPoints = steady.flatMap((run) => { const near = weights.filter((row) => Math.abs(daysApart(row.date, run.day)) <= 7).sort((a, b) => Math.abs(daysApart(a.date, run.day)) - Math.abs(daysApart(b.date, run.day)))[0]; return near ? [{ x: near.kg, y: index.get(run.id)!, date: run.day }] : []; });
    return [
    linkInsight("hrv-vs-efficiency", "Ochtend-HRV ↔ zuinig lopen", "HRV t.o.v. eigen basis (%)", "Zuinigheidsindex", hrvPoints, (r) => r > 0 ? `Op dagen met een hogere HRV loop je zuiniger (r = ${r.toFixed(2).replace(".", ",")}). Een hoge ochtend-HRV is voor jou een groen licht voor kwaliteit; een lage HRV pleit voor rustig.` : `Op dagen met een hogere HRV loop je juist minder zuinig (r = ${r.toFixed(2).replace(".", ",")}). Gebruik HRV bij jou dus voorzichtig als stuurinformatie.`),
    linkInsight("rhr-vs-efficiency", "Rusthartslag ↔ zuinig lopen", "Rusthartslag t.o.v. eigen basis (%)", "Zuinigheidsindex", rhrPoints, (r) => r < 0 ? `Bij een verhoogde rusthartslag loop je minder zuinig (r = ${r.toFixed(2).replace(".", ",")}). Een verhoogde rusthartslag is voor jou een waarschuwing om de training aan te passen.` : `Bij een verhoogde rusthartslag loop je juist zuiniger (r = ${r.toFixed(2).replace(".", ",")}). Dit komt vaak door een strakke trainingsperiode; kijk naar het totaalbeeld.`),
    linkInsight("weight-vs-efficiency", "Gewicht ↔ zuinig lopen", "Gewicht (kg)", "Zuinigheidsindex", weightPoints, (r) => r < 0 ? `Bij een lager gewicht loop je zuiniger (r = ${r.toFixed(2).replace(".", ",")}). Het afvallen werkt door in je tempo-bij-hartslag. Let op: gewicht en fitness bewegen vaak samen in de tijd, dus dit bewijst geen oorzaak.` : `Bij een lager gewicht loop je juist minder zuinig (r = ${r.toFixed(2).replace(".", ",")}). Check of je genoeg eet en herstelt; het gewicht lijkt je prestatie niet te helpen.`, 8),
  ];
}

/* ---------- waarschuwing: lichaam zegt iets ---------- */

export type BodyAlert = { level: "ok" | "let-op" | "stop"; title: string; detail: string; signals: string[] };

export function buildBodyAlert(trends: HealthTrend[]): BodyAlert {
  const get = (key: HealthKey) => trends.find((trend) => trend.key === key);
  const hrv = get("hrvMs"); const rhr = get("restingHeartRate"); const resp = get("respiratoryRate"); const oxy = get("oxygenSaturationPct");
  const signals: string[] = [];
  if (hrv?.deltaPct != null && hrv.deltaPct <= -10) signals.push(`HRV ${Math.abs(hrv.deltaPct).toLocaleString("nl-NL")}% onder je basis`);
  if (rhr?.deltaPct != null && rhr.deltaPct >= 4) signals.push(`Rusthartslag ${rhr.deltaPct.toLocaleString("nl-NL")}% boven je basis`);
  if (resp?.deltaPct != null && resp.deltaPct >= 8) signals.push(`Ademhaling ${resp.deltaPct.toLocaleString("nl-NL")}% hoger dan normaal`);
  if (oxy?.deltaPct != null && oxy.deltaPct <= -1.5) signals.push(`Zuurstofsaturatie ${Math.abs(oxy.deltaPct).toLocaleString("nl-NL")}% lager dan normaal`);
  const known = [hrv, rhr].filter((trend) => trend?.deltaPct != null).length;
  if (known === 0) return { level: "ok", title: "Nog geen lichaamsbeeld", detail: "Er is geen recente HRV of rusthartslag met eigen basislijn. Synchroniseer Apple Health om je herstel te kunnen volgen.", signals };
  if (signals.length >= 3) return { level: "stop", title: "Je lichaam geeft meerdere waarschuwingen", detail: "Meerdere signalen wijken tegelijk af. Dat past bij ziekte of zware vermoeidheid. Sla intensiteit over en kies rust.", signals };
  if (signals.length >= 2) return { level: "let-op", title: "Twee signalen wijken af", detail: "HRV en hartslag wijken allebei van je normaal af. Houd de training rustig tot ze terugkeren.", signals };
  if (signals.length === 1) return { level: "let-op", title: "Eén signaal wijkt af", detail: "Eén meting is nog geen oordeel. Volg je schema, maar let op hoe je je voelt en kijk morgen opnieuw.", signals };
  return { level: "ok", title: "Je lichaam is in balans", detail: "HRV en rusthartslag liggen binnen je normale bandbreedte.", signals };
}

/* ---------- ochtend van een run: wat zei je lichaam vooraf en hoe reageerde het erna? ---------- */

export type RunBodyContext = {
  day: string;
  before: { hrv: number | null; hrvDeltaPct: number | null; rhr: number | null; rhrDeltaPct: number | null; weightKg: number | null; steps: number | null };
  after: { hrv: number | null; hrvDeltaPct: number | null; rhr: number | null; rhrDeltaPct: number | null };
  load: number | null;
  loadShareOfWeekPct: number | null;
  form: { powerW: number | null; strideM: number | null; groundContactMs: number | null; verticalCm: number | null };
  readiness: { tone: "good" | "warning" | "unknown"; label: string };
};

export function buildRunBodyContext(run: RunLoad | undefined, day: string, health: HealthRow[], loads: RunLoad[]): RunBodyContext {
  const byDay = new Map(health.map((row) => [row.date, row]));
  const on = byDay.get(day);
  const before = byDay.get(shiftDay(day, -1));
  const next = byDay.get(shiftDay(day, 1));
  const hrvBase = baselineBefore(byDay, "hrvMs", day);
  const rhrBase = baselineBefore(byDay, "restingHeartRate", day);
  const delta = (value: number | null | undefined, base: number | null) => finite(value) && base ? round(((value - base) / base) * 100, 1) : null;
  const morningHrv = finite(on?.hrvMs) ? on.hrvMs : finite(before?.hrvMs) ? before.hrvMs : null;
  const morningRhr = finite(on?.restingHeartRate) ? on.restingHeartRate : finite(before?.restingHeartRate) ? before.restingHeartRate : null;
  const hrvDelta = delta(morningHrv, hrvBase);
  const rhrDelta = delta(morningRhr, rhrBase);
  const weekLoad = loads.filter((item) => item.day > shiftDay(day, -7) && item.day <= day).reduce((sum, item) => sum + item.load, 0);
  const weight = [0, 1, 2, 3, 4, 5, 6, 7].map((back) => byDay.get(shiftDay(day, -back))?.weightKg).find(finite) ?? null;
  const warn = (hrvDelta != null && hrvDelta <= -10) || (rhrDelta != null && rhrDelta >= 5);
  const readiness: RunBodyContext["readiness"] = hrvDelta == null && rhrDelta == null ? { tone: "unknown", label: "Geen ochtendmeting" } : warn ? { tone: "warning", label: "Je startte niet fris" } : { tone: "good", label: "Je startte fris" };
  return {
    day,
    before: { hrv: morningHrv, hrvDeltaPct: hrvDelta, rhr: morningRhr, rhrDeltaPct: rhrDelta, weightKg: weight, steps: finite(on?.steps) ? on.steps : null },
    after: { hrv: finite(next?.hrvMs) ? next.hrvMs : null, hrvDeltaPct: delta(next?.hrvMs, hrvBase), rhr: finite(next?.restingHeartRate) ? next.restingHeartRate : null, rhrDeltaPct: delta(next?.restingHeartRate, rhrBase) },
    load: run?.load ?? null,
    loadShareOfWeekPct: run && weekLoad > 0 ? Math.round((run.load / weekLoad) * 100) : null,
    form: { powerW: on?.runningPowerW ?? null, strideM: on?.runningStrideLengthM ?? null, groundContactMs: on?.runningGroundContactTimeMs ?? null, verticalCm: on?.runningVerticalOscillationCm ?? null },
    readiness,
  };
}

/* ---------- alles bijeen voor de pagina's ---------- */

export const FORM_KEYS: HealthKey[] = ["runningPowerW", "runningStrideLengthM", "runningGroundContactTimeMs", "runningVerticalOscillationCm"];
export const BODY_KEYS: HealthKey[] = ["hrvMs", "restingHeartRate", "vo2Max", "weightKg", "respiratoryRate", "oxygenSaturationPct", "steps", "exerciseMinutes"];

export function buildTrainingHealth(runRows: RunRow[], health: HealthRow[], now = new Date()) {
  const today = amsterdamDay(now);
  const sortedHealth = [...health].sort((a, b) => a.date.localeCompare(b.date));
  const loads = buildRunLoads(runRows, sortedHealth);
  const days = buildDaySeries(loads, sortedHealth, today);
  const weeks = buildWeekSeries(loads, sortedHealth, today, 104);
  const trends = Object.fromEntries([...BODY_KEYS, ...FORM_KEYS].map((key) => [key, healthTrend(sortedHealth, key, today)])) as Record<HealthKey, HealthTrend>;
  const latestHealthDate = sortedHealth.at(-1)?.date ?? null;
  return {
    today,
    loads,
    days,
    weeks,
    balance: loadBalance(days),
    trends,
    fitness: buildFitnessTrend(loads, today),
    response: buildResponseProfile(loads, sortedHealth),
    links: buildLinkInsights(loads, sortedHealth),
    alert: buildBodyAlert(BODY_KEYS.map((key) => trends[key])),
    latestHealthDate,
    healthAgeDays: latestHealthDate ? daysApart(today, latestHealthDate) : null,
  };
}
