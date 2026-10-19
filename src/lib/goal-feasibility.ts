import { classifyRun, effortTimeS, formatPaceSec, formatTime, MIN_SAMPLES, type AnalysisRun } from "./run-analysis.ts";

// Pure haalbaarheidscheck: is het doeltempo realistisch gegeven wat je recent echt liep?
// Rekent met Riegel (T2 = T1 × (D2/D1)^1.06) vanaf je beste recente wedstrijd, of (zonder wedstrijd)
// vanaf je beste trainingsloop van de laatste 8 weken, die minimaal MIN_SAMPLES trainingen vereist.

const DAY_MS = 86_400_000;
const riegel = (timeS: number, fromM: number, toM: number) => timeS * (toM / fromM) ** 1.06;

export type Feasibility = {
  tone: "good" | "warning" | "critical";
  label: string;
  detail: string;
  basis: string;
  basisSource: "race" | "training";
  predictedTimeS: number;
  predictedPaceSec: number;
  targetTimeS: number;
  /** Positief = het doel is sneller dan de voorspelling (s/km). */
  gapSecPerKm: number;
  /** Tempo-range die past bij een goede dag en een gewone dag. */
  range: { fast: string; slow: string };
};

export function buildGoalFeasibility(goal: { distanceM: number; targetPaceSecPerKm: number }, runs: AnalysisRun[], daysUntilRace: number, now = new Date()): Feasibility | null {
  const valid = runs.filter((run) => run.distanceM >= 3000 && run.movingTimeS > 0);
  const age = (run: AnalysisRun) => now.getTime() - run.startDate.getTime();
  const best = (list: AnalysisRun[]) => list.reduce<AnalysisRun | null>((top, run) => top == null || riegel(effortTimeS(run), run.distanceM, goal.distanceM) < riegel(effortTimeS(top), top.distanceM, goal.distanceM) ? run : top, null);
  const races = valid.filter((run) => age(run) >= 0 && age(run) <= 120 * DAY_MS && classifyRun(run) === "race");
  const training = valid.filter((run) => age(run) >= 0 && age(run) <= 56 * DAY_MS && run.distanceM >= 5000 && run.distanceM <= 25000 && classifyRun(run) !== "race");
  const raceBasis = best(races);
  const trainingBasis = training.length >= MIN_SAMPLES ? best(training) : null;
  const basis = raceBasis ?? trainingBasis;
  if (!basis) return null;
  const source = raceBasis ? "race" : "training";
  const predictedTimeS = riegel(effortTimeS(basis), basis.distanceM, goal.distanceM);
  const predictedPaceSec = predictedTimeS / (goal.distanceM / 1000);
  const targetTimeS = goal.targetPaceSecPerKm * (goal.distanceM / 1000);
  // diff > 0: doel sneller dan voorspelling (voorspelling − doel).
  const diff = Math.round(predictedPaceSec - goal.targetPaceSecPerKm);
  const km = (basis.distanceM / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
  const basisText = source === "race" ? `${basis.name} (${km} km in ${formatTime(effortTimeS(basis))}, ${basis.startDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })})` : `je snelste trainingsloop van de laatste 8 weken (${km} km in ${formatTime(effortTimeS(basis))}); een training is geen maximale inspanning, dus dit is voorzichtig geschat`;
  const closing = daysUntilRace <= 10 ? " Zo kort voor de start verandert je conditie niet meer: de loop zelf bepaalt nu je tempo." : "";
  let tone: Feasibility["tone"]; let label: string; let detail: string;
  if (diff <= -3) { tone = "good"; label = "Ruim haalbaar"; detail = `Je basis wijst op ${formatPaceSec(predictedPaceSec)}/km, ${Math.abs(diff)} s/km sneller dan je doel. Je kunt het doel behalen zonder risico te nemen; een iets scherper doel is verdedigbaar.${closing}`; }
  else if (diff <= 3) { tone = "good"; label = "Haalbaar"; detail = `Je basis wijst op ${formatPaceSec(predictedPaceSec)}/km, vrijwel precies je doel. Het lukt op een goede dag met een gelijkmatige verdeling.${closing}`; }
  else if (diff <= 8) { tone = "warning"; label = "Ambitieus"; detail = `Je basis wijst op ${formatPaceSec(predictedPaceSec)}/km: ${diff} s/km langzamer dan je doel. Dat kan met goed getrainde weken en perfecte omstandigheden; start voorzichtig en beslis halverwege.${closing}`; }
  else { tone = "critical"; label = "Te scherp"; detail = `Je basis wijst op ${formatPaceSec(predictedPaceSec)}/km: ${diff} s/km langzamer dan je doel. Kies als hoofddoel ${formatPaceSec(predictedPaceSec)}/km (${formatTime(predictedTimeS)}) en zie je doeltempo als bonus.${closing}`; }
  return { tone, label, detail, basis: basisText, basisSource: source, predictedTimeS, predictedPaceSec, targetTimeS, gapSecPerKm: diff, range: { fast: formatPaceSec(predictedPaceSec * 0.985), slow: formatPaceSec(predictedPaceSec * 1.015) } };
}
